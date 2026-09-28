// Analyzes a call_intelligence record with direct OpenAI, then:
//  1. Stores structured ai_analysis (takeaways, sentiment, action_items, key_decisions, client_status, next_steps)
//  2. Auto-creates follow-up tasks linked to the client (flagged ai_generated + needs_review)
//  3. Updates clients.last_contact_date, current_sentiment, last_call_headline, aspirations
//  4. Adds a `meeting` recap note + a `goals` note (history) to client_notes
//  5. Files project scope changes as approval_requests for admin review

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { openAIChat } from "../_shared/openai.ts";
import { authorizedStaff } from "../_shared/staff-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const VEKTISS_INTERNAL_CLIENT_ID = "7662c4e3-bf78-494e-b203-40a9ba06fb27";

    const userId = await authorizedStaff(req);
    if (!userId) return Response.json({ error: "Explicit staff request required" }, { status: 403, headers: corsHeaders });

    const ensure = (error: any, context: string) => {
      if (error) throw new Error(`${context}: ${error.message ?? String(error)}`);
    };

    const body = await req.json().catch(() => ({}));
    const { call_id } = body ?? {};
    if (!call_id) {
      return new Response(JSON.stringify({ error: "call_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: call, error: callErr } = await admin
      .from("call_intelligence")
      .select("id, client_id, call_date, call_type, summary, transcript, ai_analysis")
      .eq("id", call_id)
      .maybeSingle();
    if (callErr) throw callErr;
    if (!call) {
      return new Response(JSON.stringify({ error: "Call not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cost cap: truncate transcript to keep prompt small
    const sourceText = (call.summary ?? "").slice(0, 4000) + (call.transcript ? "\n\nTRANSCRIPT:\n" + call.transcript.slice(0, 8000) : "");
    if (!sourceText.trim()) {
      return new Response(JSON.stringify({ error: "Call has no summary or transcript to analyze" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let clientName = "Unknown";
    if (call.client_id) {
      const { data: c } = await admin.from("clients").select("name").eq("id", call.client_id).maybeSingle();
      clientName = c?.name ?? clientName;
    }

    const systemPrompt = `You are Vektiss AI analyzing a client call. Return ONLY a valid JSON object (no markdown fences) with this exact shape:
{
  "headline": "1-sentence summary of what happened",
  "client_status": "1-2 sentence overview of where the client stands now (mood, momentum, blockers)",
  "current_status_recap": "3-5 sentence plain-English brief that someone reading it for the FIRST time can fully understand. Cover: who the client is in 1 phrase, what they hired/are hiring us for, what was decided/discussed in this most recent contact, and what we owe them next. No jargon, no bullets, no markdown.",
  "sentiment": "positive | neutral | negative | mixed",
  "aspirations": "1-3 sentences capturing the client's stated goals/dreams/vision from this call (null if nothing new)",
  "scope_changes": ["proposed addition or change to project scope (each ~1 sentence)"],
  "key_decisions": ["decision 1", "decision 2"],
  "action_items": [
    {"title": "short verb-led task", "description": "why & detail", "priority": "high|medium|low", "due_in_days": 3, "owner": "vektiss|client"}
  ],
  "next_steps": "what we owe the client and when",
  "risks": ["risk 1", "risk 2"]
}
Rules:
- 2-5 action_items, only ones Vektiss should do (owner=vektiss). Skip client-side todos but list them in next_steps.
- Be specific with names, numbers, dates from the call.
- due_in_days is an integer 1-14.
- aspirations: only fill if the client expressed new goals/vision/dreams. Otherwise return null.
- scope_changes: only items that change project scope/timeline/deliverables. Empty array if none.
- Never use markdown bold (**) anywhere.`;

    const aiRes = await openAIChat("analyze-call", {
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Client: ${clientName}\nCall type: ${call.call_type}\nDate: ${call.call_date}\n\n${sourceText}` },
        ],
    }, { cacheKey: `analysis-v1:${call.id}` });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      throw new Error(`AI gateway error ${aiRes.status}: ${t.slice(0, 300)}`);
    }
    const aiJson = await aiRes.json();
    let raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
    raw = String(raw).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    let analysis: any;
    try { analysis = JSON.parse(raw); } catch {
      throw new Error("AI returned invalid JSON: " + raw.slice(0, 200));
    }

    // Persist analysis on the call
    const { error: analysisUpdateError } = await admin
      .from("call_intelligence")
      .update({
        ai_analysis: analysis,
        sentiment: analysis.sentiment ?? null,
        key_decisions: Array.isArray(analysis.key_decisions) ? analysis.key_decisions : [],
      })
      .eq("id", call.id);
    ensure(analysisUpdateError, "Call analysis could not be saved");

    const created: any = { tasks: 0, note: false, contact_updated: false };

    if (call.client_id) {
      // Update last_contact_date
      const callDay = (call.call_date ?? new Date().toISOString()).slice(0, 10);
      const { error: contactError } = await admin.from("clients").update({ last_contact_date: callDay }).eq("id", call.client_id);
      ensure(contactError, "Client contact date could not be updated");
      created.contact_updated = true;

      // Auto-create tasks (skip duplicates by title for this client)
      const items: any[] = Array.isArray(analysis.action_items) ? analysis.action_items : [];
      const { data: existingTasks } = await admin
        .from("tasks").select("title").eq("client_id", call.client_id).is("archived_at", null);
      const existingTitles = new Set((existingTasks ?? []).map((t: any) => (t.title ?? "").toLowerCase().trim()));

      for (const [itemIndex, item] of items.entries()) {
        if (!item?.title) continue;
        if ((item.owner ?? "vektiss") !== "vektiss") continue;
        const t = String(item.title).trim();
        if (existingTitles.has(t.toLowerCase())) continue;
        const days = Math.min(14, Math.max(1, parseInt(item.due_in_days ?? 3, 10) || 3));
        const due = new Date();
        due.setDate(due.getDate() + days);
        const priority = ["high", "medium", "low"].includes(item.priority) ? item.priority : "medium";
        const { error: taskError } = await admin.from("tasks").upsert({
          title: t,
          description: `[From ${call.call_type} call ${callDay}] ${item.description ?? ""}`.trim(),
          status: "todo",
          priority,
          client_id: call.client_id,
          due_date: due.toISOString().slice(0, 10),
          ai_generated: true,
          needs_review: true,
          source_call_id: call.id,
          ai_source_key: `${call.id}:task:${itemIndex}`,
        }, { onConflict: "ai_source_key", ignoreDuplicates: true });
        ensure(taskError, "Follow-up task could not be saved");
        created.tasks++;
      }

      // Add a meeting note (one per call_id; skip if one already exists referencing this call)
      const noteTitle = `Call recap — ${callDay}`;
      const { data: existingNote } = await admin
        .from("client_notes")
        .select("id")
        .eq("client_id", call.client_id)
        .eq("type", "meeting")
        .eq("title", noteTitle)
        .maybeSingle();

      if (!existingNote) {
        const noteContent = [
          analysis.headline ? `${analysis.headline}` : null,
          analysis.client_status ? `\nWhere they stand: ${analysis.client_status}` : null,
          Array.isArray(analysis.key_decisions) && analysis.key_decisions.length
            ? `\nDecisions:\n` + analysis.key_decisions.map((d: string) => `- ${d}`).join("\n") : null,
          analysis.next_steps ? `\nNext steps: ${analysis.next_steps}` : null,
          Array.isArray(analysis.risks) && analysis.risks.length
            ? `\nRisks:\n` + analysis.risks.map((d: string) => `- ${d}`).join("\n") : null,
        ].filter(Boolean).join("\n");

        const createdBy = userId ?? "00000000-0000-0000-0000-000000000000";
        const { error: noteError } = await admin.from("client_notes").upsert({
          client_id: call.client_id,
          type: "meeting",
          title: noteTitle,
          content: noteContent,
          meeting_date: call.call_date,
          created_by: createdBy,
          ai_source_key: `${call.id}:recap`,
        }, { onConflict: "ai_source_key", ignoreDuplicates: true });
        ensure(noteError, "Call recap could not be saved");
        created.note = true;
      }

      // Update profile snapshot fields (aspirations, sentiment, last call)
      const profileUpdate: Record<string, any> = {
        last_contact_date: callDay,
        current_sentiment: analysis.sentiment ?? null,
        last_call_headline: analysis.headline ?? null,
        last_call_id: call.id,
      };
      if (analysis.current_status_recap && String(analysis.current_status_recap).trim()) {
        profileUpdate.current_status_recap = String(analysis.current_status_recap).trim();
        profileUpdate.current_status_updated_at = new Date().toISOString();
      }
      if (analysis.aspirations && String(analysis.aspirations).trim() && String(analysis.aspirations).toLowerCase() !== "null") {
        profileUpdate.aspirations = String(analysis.aspirations).trim();
        profileUpdate.aspirations_updated_at = new Date().toISOString();

        // Append to goals history timeline
        const createdBy = userId ?? "00000000-0000-0000-0000-000000000000";
        const { error: goalsError } = await admin.from("client_notes").upsert({
          client_id: call.client_id,
          type: "goals",
          title: `Goals from call — ${callDay}`,
          content: profileUpdate.aspirations,
          meeting_date: call.call_date,
          created_by: createdBy,
          ai_source_key: `${call.id}:goals`,
        }, { onConflict: "ai_source_key", ignoreDuplicates: true });
        ensure(goalsError, "Client goals could not be saved");
        created.goals_logged = true;
      }
      const { error: profileError } = await admin.from("clients").update(profileUpdate).eq("id", call.client_id);
      ensure(profileError, "Client briefing could not be updated");

      // File scope changes as approval requests for admin review
      const scopeChanges: string[] = Array.isArray(analysis.scope_changes) ? analysis.scope_changes : [];
      if (scopeChanges.length) {
        const { data: activeProject } = await admin
          .from("projects")
          .select("id")
          .eq("client_id", call.client_id)
          .in("status", ["not_started", "in_progress"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (activeProject?.id) {
          const submittedBy = userId ?? "00000000-0000-0000-0000-000000000000";
          for (const [changeIndex, change] of scopeChanges.entries()) {
            if (!change || !String(change).trim()) continue;
            const { error: approvalError } = await admin.from("approval_requests").upsert({
              client_id: call.client_id,
              project_id: activeProject.id,
              title: `Scope change proposed — ${callDay}`,
              description: String(change).trim(),
              status: "pending",
              submitted_by: submittedBy,
              ai_source_key: `${call.id}:scope:${changeIndex}`,
            }, { onConflict: "ai_source_key", ignoreDuplicates: true });
            ensure(approvalError, "Scope proposal could not be saved");
          }
          created.scope_proposals = scopeChanges.length;
        }
      }

      // Nudge admins to attach reference materials (Gamma decks, Dropbox folders, etc.) used during the call
      try {
        const { data: admins } = await admin
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin"]);
        const adminIds = Array.from(new Set((admins ?? []).map((r: any) => r.user_id))).filter(Boolean);
        if (adminIds.length) {
          const link = `/admin/clients/${call.client_id}`;
          const rows = adminIds.map((uid: string) => ({
            user_id: uid,
            type: "call_assets_prompt",
            title: `Attach assets for ${clientName}?`,
            body: `A call was just analyzed. Did you reference a Gamma deck, Dropbox folder, or other materials? Add them to the Latest Briefing so the team has full context.`,
            link,
            ai_source_key: `${call.id}:assets:${uid}`,
          }));
          const { error: notificationError } = await admin.from("notifications").upsert(rows, { onConflict: "ai_source_key", ignoreDuplicates: true });
          ensure(notificationError, "Asset notification could not be saved");
          created.assets_prompt = adminIds.length;
        }
      } catch (_) { /* non-fatal */ }
    }

    // Internal/Vektiss call bridge → company brain
    // When the call is tied to the internal Vektiss client, mirror the recap
    // into company_summaries so the daily briefing + AI brain pick it up as
    // company-state context (not just one client's record).
    if (call.client_id === VEKTISS_INTERNAL_CLIENT_ID) {
      try {
        const callDay = (call.call_date ?? new Date().toISOString()).slice(0, 10);
        const summaryBody = [
          analysis.headline ? analysis.headline : null,
          analysis.client_status ? `\nState: ${analysis.client_status}` : null,
          Array.isArray(analysis.key_decisions) && analysis.key_decisions.length
            ? `\nDecisions:\n` + analysis.key_decisions.map((d: string) => `- ${d}`).join("\n") : null,
          analysis.next_steps ? `\nNext steps: ${analysis.next_steps}` : null,
          Array.isArray(analysis.risks) && analysis.risks.length
            ? `\nRisks:\n` + analysis.risks.map((d: string) => `- ${d}`).join("\n") : null,
        ].filter(Boolean).join("\n");

        const createdBy = userId ?? "00000000-0000-0000-0000-000000000000";
        const title = `Internal call recap — ${callDay}`;
        const { data: existingSummary } = await admin
          .from("company_summaries")
          .select("id")
          .eq("title", title)
          .maybeSingle();
        if (!existingSummary) {
          const { error: companySummaryError } = await admin.from("company_summaries").upsert({
            title,
            content: summaryBody,
            summary_date: callDay,
            created_by: createdBy,
            ai_source_key: `${call.id}:company`,
          }, { onConflict: "ai_source_key", ignoreDuplicates: true });
          ensure(companySummaryError, "Company summary could not be saved");
          created.company_summary = true;
        }
      } catch (_) { /* non-fatal */ }
    }

    const { error: completedError } = await admin
      .from("call_intelligence")
      .update({ analysis_pending: false })
      .eq("id", call.id);
    ensure(completedError, "Analysis completion could not be recorded");

    return new Response(JSON.stringify({ ok: true, analysis, created }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
