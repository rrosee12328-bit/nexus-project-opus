import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-2.5-flash";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

function clip(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function gatherContext(client_id: string) {
  const [clientRes, notesRes, callsRes, tasksRes, approvalsRes, milestonesRes] = await Promise.all([
    admin.from("clients").select("id, name, type, status, monthly_fee, billing_model, billing_paused_until, balance_due, aspirations, current_sentiment, current_status_recap, last_call_headline, last_contact_date, start_date").eq("id", client_id).maybeSingle(),
    admin.from("client_notes").select("title, type, content, meeting_date, created_at").eq("client_id", client_id).order("created_at", { ascending: false }).limit(20),
    admin.from("call_intelligence").select("call_date, call_type, summary, key_decisions, sentiment").eq("client_id", client_id).order("call_date", { ascending: false }).limit(15),
    admin.from("tasks").select("title, status, priority, due_date").eq("client_id", client_id).neq("status", "done").order("created_at", { ascending: false }).limit(10),
    admin.from("approval_requests").select("title, status, phase, created_at").eq("client_id", client_id).order("created_at", { ascending: false }).limit(5),
    admin.from("phase_milestone_invoices").select("phase, amount, status, created_at").eq("client_id", client_id).eq("status", "pending").order("created_at", { ascending: false }).limit(5),
  ]);
  return {
    client: clientRes.data,
    notes: notesRes.data ?? [],
    calls: callsRes.data ?? [],
    tasks: tasksRes.data ?? [],
    approvals: approvalsRes.data ?? [],
    milestones: milestonesRes.data ?? [],
  };
}

function buildPrompt(ctx: Awaited<ReturnType<typeof gatherContext>>) {
  const { client, notes, calls, tasks, approvals, milestones } = ctx;
  if (!client) return null;

  const lines: string[] = [];
  lines.push(`CLIENT: ${client.name} (${client.type ?? "n/a"}) — status: ${client.status}`);
  if (client.monthly_fee) lines.push(`Monthly fee: $${client.monthly_fee} | Billing: ${client.billing_model}${client.billing_paused_until ? ` (paused until ${client.billing_paused_until})` : ""}`);
  if (client.balance_due) lines.push(`Balance due: $${client.balance_due}`);
  if (client.last_contact_date) lines.push(`Last contact: ${client.last_contact_date}`);
  if (client.aspirations) lines.push(`Aspirations: ${clip(client.aspirations, 400)}`);
  if (client.current_status_recap) lines.push(`Existing status recap: ${clip(client.current_status_recap, 600)}`);
  if (client.current_sentiment) lines.push(`Latest sentiment: ${client.current_sentiment}`);

  if (notes.length) {
    lines.push(`\n=== NOTES (${notes.length}) ===`);
    for (const n of notes) {
      const date = (n.meeting_date ?? n.created_at)?.toString().slice(0, 10) ?? "";
      lines.push(`- [${date}] ${n.type}: ${n.title}\n  ${clip(n.content, 600)}`);
    }
  }

  if (calls.length) {
    lines.push(`\n=== CALLS (${calls.length}) ===`);
    for (const c of calls) {
      const date = c.call_date?.toString().slice(0, 10) ?? "";
      const decisions = Array.isArray(c.key_decisions) && c.key_decisions.length ? `\n  Decisions: ${(c.key_decisions as any[]).slice(0, 5).map((d) => String(d)).join(" | ")}` : "";
      lines.push(`- [${date}] ${c.call_type ?? "call"} (${c.sentiment ?? "n/a"}): ${clip(c.summary, 500)}${decisions}`);
    }
  }

  if (tasks.length) {
    lines.push(`\n=== OPEN TASKS ===`);
    for (const t of tasks) lines.push(`- [${t.status}/${t.priority}${t.due_date ? ` due ${t.due_date}` : ""}] ${t.title}`);
  }

  if (approvals.length) {
    lines.push(`\n=== APPROVALS ===`);
    for (const a of approvals) lines.push(`- [${a.status}] ${a.title} (${a.phase ?? ""})`);
  }

  if (milestones.length) {
    lines.push(`\n=== PENDING MILESTONE INVOICES ===`);
    for (const m of milestones) lines.push(`- ${m.phase}: $${m.amount} pending`);
  }

  return lines.join("\n");
}

async function callAI(contextText: string) {
  const system = `You write concise internal client briefings for an agency owner. Plain English, no markdown, no bold (**), no headers, no lists in the prose. Be specific — name the active project, the latest decision, money owed, or scope blockers. If context is thin, say so honestly. Do not invent facts.`;

  const tools = [{
    type: "function",
    function: {
      name: "client_briefing",
      description: "A rolling client status briefing.",
      parameters: {
        type: "object",
        properties: {
          headline: { type: "string", description: "Single line, under 90 chars, what defines this client right now." },
          summary: { type: "string", description: "2-3 plain sentences. Where they stand, what is active, latest meaningful event. No markdown." },
          next_step: { type: "string", description: "One concrete next action. Empty string if unclear." },
          sentiment: { type: "string", enum: ["positive", "neutral", "concerned", "negative", "unknown"] },
        },
        required: ["headline", "summary", "next_step", "sentiment"],
        additionalProperties: false,
      },
    },
  }];

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: contextText }],
      tools,
      tool_choice: { type: "function", function: { name: "client_briefing" } },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("No tool call returned");
  const parsed = JSON.parse(args);
  // Strip any stray ** the model may have included
  parsed.headline = String(parsed.headline ?? "").replace(/\*\*/g, "").trim();
  parsed.summary = String(parsed.summary ?? "").replace(/\*\*/g, "").trim();
  parsed.next_step = String(parsed.next_step ?? "").replace(/\*\*/g, "").trim();
  return parsed as { headline: string; summary: string; next_step: string; sentiment: string };
}

async function processOne(client_id: string, force = false): Promise<{ client_id: string; status: string; error?: string }> {
  try {
    const ctx = await gatherContext(client_id);
    if (!ctx.client) return { client_id, status: "missing_client" };

    const fingerprint = JSON.stringify({
      n: ctx.notes.map((x) => [x.title, x.created_at, (x.content ?? "").length]),
      c: ctx.calls.map((x) => [x.call_date, (x.summary ?? "").length, x.sentiment]),
      t: ctx.tasks.map((x) => [x.title, x.status]),
      a: ctx.approvals.map((x) => [x.title, x.status]),
      m: ctx.milestones.map((x) => [x.phase, x.status, x.amount]),
      cl: [ctx.client.status, ctx.client.balance_due, ctx.client.last_contact_date, ctx.client.current_status_recap, ctx.client.aspirations],
    });
    const source_hash = await sha256(fingerprint);

    if (!force) {
      const { data: existing } = await admin.from("client_ai_summaries").select("source_hash").eq("client_id", client_id).maybeSingle();
      if (existing?.source_hash === source_hash) return { client_id, status: "cached" };
    }

    const contextText = buildPrompt(ctx);
    if (!contextText || (ctx.notes.length === 0 && ctx.calls.length === 0)) {
      // Thin context — write a placeholder so the UI shows something useful
      await admin.from("client_ai_summaries").upsert({
        client_id,
        headline: "Not enough context yet",
        summary: `${ctx.client.name} doesn't have meeting notes or analyzed calls yet, so there isn't a meaningful status to summarize.`,
        next_step: "Log a note or sync a call to start building context.",
        sentiment: "unknown",
        notes_count: ctx.notes.length,
        calls_count: ctx.calls.length,
        source_hash,
        model: MODEL,
        generated_at: new Date().toISOString(),
      });
      return { client_id, status: "thin" };
    }

    const ai = await callAI(contextText);
    await admin.from("client_ai_summaries").upsert({
      client_id,
      headline: ai.headline,
      summary: ai.summary,
      next_step: ai.next_step,
      sentiment: ai.sentiment,
      notes_count: ctx.notes.length,
      calls_count: ctx.calls.length,
      source_hash,
      model: MODEL,
      generated_at: new Date().toISOString(),
    });
    return { client_id, status: "regenerated" };
  } catch (e: any) {
    console.error(`generate-client-summary[${client_id}]`, e);
    return { client_id, status: "error", error: e?.message ?? String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const force = !!body.force;

    let ids: string[] = [];
    if (Array.isArray(body.client_ids)) {
      ids = body.client_ids.filter((x: any) => typeof x === "string");
    } else if (typeof body.client_id === "string") {
      ids = [body.client_id];
    } else if (body.all === true) {
      const maxAge = Number(body.max_age_minutes ?? 1440);
      const cutoff = new Date(Date.now() - maxAge * 60_000).toISOString();
      const { data: clientsRows } = await admin.from("clients").select("id").in("status", ["active", "onboarding", "prospect", "lead"]);
      const allIds = (clientsRows ?? []).map((c: any) => c.id);
      const { data: existing } = await admin.from("client_ai_summaries").select("client_id, generated_at").in("client_id", allIds);
      const fresh = new Set((existing ?? []).filter((r: any) => r.generated_at > cutoff).map((r: any) => r.client_id));
      ids = allIds.filter((id) => !fresh.has(id));
    }

    if (ids.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process up to 4 in parallel
    const results: any[] = [];
    for (let i = 0; i < ids.length; i += 4) {
      const batch = ids.slice(i, i + 4);
      const r = await Promise.all(batch.map((id) => processOne(id, force)));
      results.push(...r);
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-client-summary error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});