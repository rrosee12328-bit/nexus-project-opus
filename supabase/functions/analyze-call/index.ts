// Analyzes a call_intelligence record with Lovable AI, then:
//  1. Stores structured ai_analysis (takeaways, sentiment, action_items, key_decisions, client_status, next_steps)
//  2. Auto-creates follow-up tasks linked to the client (flagged ai_generated + needs_review)
//  3. Updates clients.last_contact_date, current_sentiment, last_call_headline, aspirations
//  4. Adds a `meeting` recap note + a `goals` note (history) to client_notes
//  5. Files project scope changes as approval_requests for admin review

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Resolve user (admin/ops) — allow service_role bypass for internal calls
    let userId: string | null = null;
    let isService = false;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      if (token === serviceRoleKey) {
        isService = true;
      } else {
        const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: claims } = await userClient.auth.getClaims(token);
        userId = claims?.claims?.sub ?? null;
        if (!userId) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
        const ok = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "ops");
        if (!ok) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } else {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const sourceText = (call.summary ?? "") + (call.transcript ? "\n\nTRANSCRIPT:\n" + call.transcript.slice(0, 18000) : "");
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

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Client: ${clientName}\nCall type: ${call.call_type}\nDate: ${call.call_date}\n\n${sourceText}` },
        ],
      }),
    });

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
    await admin
      .from("call_intelligence")
      .update({
        ai_analysis: analysis,
        sentiment: analysis.sentiment ?? null,
        key_decisions: Array.isArray(analysis.key_decisions) ? analysis.key_decisions : [],
      })
      .eq("id", call.id);

    const created: any = { tasks: 0, note: false, contact_updated: false };

    if (call.client_id) {
      // Update last_contact_date
      const callDay = (call.call_date ?? new Date().toISOString()).slice(0, 10);
      await admin.from("clients").update({ last_contact_date: callDay }).eq("id", call.client_id);
      created.contact_updated = true;

      // Auto-create tasks (skip duplicates by title for this client)
      const items: any[] = Array.isArray(analysis.action_items) ? analysis.action_items : [];
      const { data: existingTasks } = await admin
        .from("tasks").select("title").eq("client_id", call.client_id).is("archived_at", null);
      const existingTitles = new Set((existingTasks ?? []).map((t: any) => (t.title ?? "").toLowerCase().trim()));

      for (const item of items) {
        if (!item?.title) continue;
        if ((item.owner ?? "vektiss") !== "vektiss") continue;
        const t = String(item.title).trim();
        if (existingTitles.has(t.toLowerCase())) continue;
        const days = Math.min(14, Math.max(1, parseInt(item.due_in_days ?? 3, 10) || 3));
        const due = new Date();
        due.setDate(due.getDate() + days);
        const priority = ["high", "medium", "low"].includes(item.priority) ? item.priority : "medium";
        await admin.from("tasks").insert({
          title: t,
          description: `[From ${call.call_type} call ${callDay}] ${item.description ?? ""}`.trim(),
          status: "todo",
          priority,
          client_id: call.client_id,
          due_date: due.toISOString().slice(0, 10),
          ai_generated: true,
          needs_review: true,
          source_call_id: call.id,
        });
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
        await admin.from("client_notes").insert({
          client_id: call.client_id,
          type: "meeting",
          title: noteTitle,
          content: noteContent,
          meeting_date: call.call_date,
          created_by: createdBy,
        });
        created.note = true;
      }

      // Update profile snapshot fields (aspirations, sentiment, last call)
      const profileUpdate: Record<string, any> = {
        last_contact_date: callDay,
        current_sentiment: analysis.sentiment ?? null,
        last_call_headline: analysis.headline ?? null,
        last_call_id: call.id,
      };
      if (analysis.aspirations && String(analysis.aspirations).trim() && String(analysis.aspirations).toLowerCase() !== "null") {
        profileUpdate.aspirations = String(analysis.aspirations).trim();
        profileUpdate.aspirations_updated_at = new Date().toISOString();

        // Append to goals history timeline
        const createdBy = userId ?? "00000000-0000-0000-0000-000000000000";
        await admin.from("client_notes").insert({
          client_id: call.client_id,
          type: "goals",
          title: `Goals from call — ${callDay}`,
          content: profileUpdate.aspirations,
          meeting_date: call.call_date,
          created_by: createdBy,
        });
        created.goals_logged = true;
      }
      await admin.from("clients").update(profileUpdate).eq("id", call.client_id);

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
          for (const change of scopeChanges) {
            if (!change || !String(change).trim()) continue;
            await admin.from("approval_requests").insert({
              client_id: call.client_id,
              project_id: activeProject.id,
              title: `Scope change proposed — ${callDay}`,
              description: String(change).trim(),
              status: "pending",
              submitted_by: submittedBy,
            });
          }
          created.scope_proposals = scopeChanges.length;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, analysis, created }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});