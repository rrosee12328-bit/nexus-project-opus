import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-2.5-flash";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

type Action = {
  kind:
    | "client_note"
    | "client_preference"
    | "client_aspiration"
    | "calendar_event"
    | "task"
    | "company_summary"
    | "client_cost"
    | "client_payment";
  client_id?: string | null;
  client_name_guess?: string | null;
  confidence: number; // 0-1
  payload: Record<string, unknown>;
  reason: string;
};

const SYSTEM = `You are the routing brain for Vektiss' admin portal. The user dumps unstructured context (about clients, the company, ideas, status updates, meetings, money). Your job: classify the dump into one or more concrete actions that route the data to the correct table.

Available action kinds:
- client_note: status update, observation, conversation recap, anything about a client that's narrative. payload: { title, content, meeting_date? (ISO) }
- client_preference: a rule/preference about HOW to work with this client ("they hate X", "always Y", "prefers Tuesdays"). payload: { rule, category? }
- client_aspiration: long-term goal/aspiration the client expressed. payload: { aspirations }
- calendar_event: a meeting, call, or scheduled date. payload: { title, event_date (YYYY-MM-DD), start_time? (HH:MM), end_time? (HH:MM), event_type, description? }
- task: an action item / todo. payload: { title, description?, priority?, due_date? }
- company_summary: a company-wide insight, decision, or strategy note (NOT client-specific). payload: { title, content }
- client_cost: a recurring or one-off cost tied to a client. payload: { category, amount, is_monthly, details? }
- client_payment: a payment received from a client. payload: { amount, payment_year, payment_month, notes? }

RULES:
- Pick a confidence between 0 and 1. Use 0.85+ only when client identity AND action kind are unambiguous.
- If a client is mentioned by name, return client_name_guess (the exact name as written). The server will resolve to client_id.
- Multiple unrelated facts -> multiple actions.
- Never invent client names. If unclear, leave client_name_guess null and confidence low.
- Never use markdown bold (**) anywhere in payload text.
- Dates: convert relative like "tomorrow", "next Tuesday" using the provided NOW.

Return ONLY a JSON object: { "actions": Action[] }.`;

async function classify(input: string): Promise<{ actions: Action[] }> {
  const now = new Date().toISOString();
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `NOW: ${now}\n\nDUMP:\n${input}` },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI routing failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(text);
    return { actions: Array.isArray(parsed.actions) ? parsed.actions : [] };
  } catch {
    return { actions: [] };
  }
}

async function resolveClientId(name: string | null | undefined): Promise<{ id: string | null; name: string | null }> {
  if (!name) return { id: null, name: null };
  // Exact (case-insensitive) first
  const { data: exact } = await admin
    .from("clients")
    .select("id, name")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (exact) return { id: exact.id, name: exact.name };
  // Fuzzy contains
  const { data: fuzzy } = await admin
    .from("clients")
    .select("id, name")
    .ilike("name", `%${name}%`)
    .limit(2);
  if (fuzzy && fuzzy.length === 1) return { id: fuzzy[0].id, name: fuzzy[0].name };
  return { id: null, name: null };
}

async function commitOne(action: Action, user_id: string): Promise<{ ok: boolean; error?: string; route?: string }> {
  const p = action.payload || {};
  switch (action.kind) {
    case "client_note": {
      if (!action.client_id) return { ok: false, error: "missing client_id" };
      const { error } = await admin.from("client_notes").insert({
        client_id: action.client_id,
        created_by: user_id,
        title: String(p.title ?? "Context update").slice(0, 200),
        content: String(p.content ?? ""),
        type: "note",
        meeting_date: p.meeting_date ?? new Date().toISOString(),
      });
      return error ? { ok: false, error: error.message } : { ok: true, route: "client_notes" };
    }
    case "client_preference": {
      const { error } = await admin.from("ai_preferences").insert({
        scope: action.client_id ? "client" : "global",
        scope_id: action.client_id ?? null,
        rule: String(p.rule ?? "").slice(0, 1000),
        category: (p.category as string) ?? null,
        created_by: user_id,
        active: true,
      });
      return error ? { ok: false, error: error.message } : { ok: true, route: "ai_preferences" };
    }
    case "client_aspiration": {
      if (!action.client_id) return { ok: false, error: "missing client_id" };
      const { error } = await admin.from("clients").update({
        aspirations: String(p.aspirations ?? ""),
        aspirations_updated_at: new Date().toISOString(),
      }).eq("id", action.client_id);
      return error ? { ok: false, error: error.message } : { ok: true, route: "clients.aspirations" };
    }
    case "calendar_event": {
      const { error } = await admin.from("calendar_events").insert({
        title: String(p.title ?? "Untitled").slice(0, 200),
        event_date: p.event_date,
        start_time: p.start_time ?? null,
        end_time: p.end_time ?? null,
        event_type: (p.event_type as string) ?? "meeting",
        description: (p.description as string) ?? null,
        client_id: action.client_id ?? null,
        created_by: user_id,
        billable: true,
      });
      return error ? { ok: false, error: error.message } : { ok: true, route: "calendar_events" };
    }
    case "task": {
      // Tasks are tied to clients in this system; require one
      if (!action.client_id) return { ok: false, error: "missing client_id" };
      const { error } = await admin.from("tasks").insert({
        client_id: action.client_id,
        title: String(p.title ?? "Task").slice(0, 200),
        description: (p.description as string) ?? null,
        priority: (p.priority as string) ?? "medium",
        due_date: (p.due_date as string) ?? null,
        status: "todo",
      });
      return error ? { ok: false, error: error.message } : { ok: true, route: "tasks" };
    }
    case "company_summary": {
      const { error } = await admin.from("company_summaries").insert({
        title: String(p.title ?? "Note").slice(0, 200),
        content: String(p.content ?? ""),
        summary_date: new Date().toISOString().slice(0, 10),
        created_by: user_id,
      });
      return error ? { ok: false, error: error.message } : { ok: true, route: "company_summaries" };
    }
    case "client_cost": {
      if (!action.client_id) return { ok: false, error: "missing client_id" };
      const { error } = await admin.from("client_costs").insert({
        client_id: action.client_id,
        category: String(p.category ?? "other"),
        amount: Number(p.amount ?? 0),
        is_monthly: p.is_monthly !== false,
        details: (p.details as string) ?? null,
      });
      return error ? { ok: false, error: error.message } : { ok: true, route: "client_costs" };
    }
    case "client_payment": {
      if (!action.client_id) return { ok: false, error: "missing client_id" };
      const now = new Date();
      const { error } = await admin.from("client_payments").insert({
        client_id: action.client_id,
        amount: Number(p.amount ?? 0),
        payment_year: Number(p.payment_year ?? now.getFullYear()),
        payment_month: Number(p.payment_month ?? now.getMonth() + 1),
        payment_source: "manual",
        notes: (p.notes as string) ?? null,
      });
      return error ? { ok: false, error: error.message } : { ok: true, route: "client_payments" };
    }
    default:
      return { ok: false, error: `unknown kind: ${action.kind}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Verify admin
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const mode = (body.mode as string) ?? "preview"; // "preview" | "commit"
    const input = String(body.input ?? "").trim();

    if (mode === "preview") {
      if (input.length < 2 || input.length > 5000) {
        return new Response(JSON.stringify({ error: "input must be 2-5000 chars" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { actions } = await classify(input);
      // Resolve client names -> ids
      const enriched = await Promise.all(actions.map(async (a) => {
        const { id, name } = await resolveClientId(a.client_name_guess ?? null);
        return { ...a, client_id: id, client_name_resolved: name };
      }));
      return new Response(JSON.stringify({ actions: enriched }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "commit") {
      const actions = (body.actions ?? []) as Action[];
      if (!Array.isArray(actions) || actions.length === 0) {
        return new Response(JSON.stringify({ error: "no actions" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const results: Array<{ kind: string; ok: boolean; route?: string; error?: string }> = [];
      for (const a of actions) {
        const r = await commitOne(a, user.id);
        results.push({ kind: a.kind, ...r });
      }
      // After commits, refresh client summaries for affected clients (best-effort)
      const affectedClients = Array.from(new Set(actions.map((a) => a.client_id).filter(Boolean))) as string[];
      if (affectedClients.length > 0) {
        admin.functions
          .invoke("generate-client-summary", { body: { client_ids: affectedClients } })
          .catch(() => {});
      }
      return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "invalid mode" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});