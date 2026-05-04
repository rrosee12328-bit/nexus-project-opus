// Generates prep tasks for upcoming calendar events (today/this week/this month)
// and backfills AI analysis for any call_intelligence rows that lack it.
// Idempotent: dedupes prep tasks by source key in description.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const VEKTISS_FALLBACK_NAME = "Vektiss";

async function getVektissClientId(): Promise<string | null> {
  const { data } = await admin.from("clients").select("id").ilike("name", VEKTISS_FALLBACK_NAME).limit(1).maybeSingle();
  return data?.id ?? null;
}

function priorityFor(daysUntil: number): "high" | "medium" | "low" {
  if (daysUntil <= 1) return "high";
  if (daysUntil <= 7) return "medium";
  return "low";
}

async function createPrepTasksForUpcomingEvents() {
  const today = new Date();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 31);
  const todayStr = today.toISOString().slice(0, 10);
  const horizonStr = horizon.toISOString().slice(0, 10);

  const { data: events } = await admin
    .from("calendar_events")
    .select("id, title, event_date, start_time, event_type, client_id, description")
    .gte("event_date", todayStr)
    .lte("event_date", horizonStr)
    .order("event_date");

  if (!events?.length) return { events: 0, created: 0 };

  const vektissId = await getVektissClientId();
  let created = 0;

  for (const ev of events) {
    const sourceKey = `[event:${ev.id}]`;
    // Dedup: skip if a task already references this event
    const { data: existing } = await admin
      .from("tasks")
      .select("id")
      .ilike("description", `%${sourceKey}%`)
      .limit(1)
      .maybeSingle();
    if (existing) continue;

    const eventDate = new Date(ev.event_date + "T00:00:00");
    const days = Math.max(0, Math.round((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    // Due the day BEFORE the event (or today if event is today/tomorrow)
    const due = new Date(eventDate);
    due.setDate(due.getDate() - 1);
    if (due < today) due.setTime(today.getTime());
    const dueStr = due.toISOString().slice(0, 10);

    const clientId = ev.client_id ?? vektissId;
    if (!clientId) continue;

    const timeStr = ev.start_time ? ` at ${String(ev.start_time).slice(0, 5)}` : "";
    const desc = `${sourceKey} Prep for "${ev.title}" on ${ev.event_date}${timeStr}. ${ev.description ?? ""}`.trim();

    await admin.from("tasks").insert({
      title: `Prep: ${ev.title}`,
      description: desc,
      status: "todo",
      priority: priorityFor(days),
      client_id: clientId,
      due_date: dueStr,
      ai_generated: true,
      needs_review: true,
    });
    created++;
  }

  return { events: events.length, created };
}

async function backfillUnanalyzedCalls(limit = 25) {
  const { data: calls } = await admin
    .from("call_intelligence")
    .select("id")
    .is("ai_analysis", null)
    .not("summary", "is", null)
    .order("call_date", { ascending: false })
    .limit(limit);

  if (!calls?.length) return { analyzed: 0 };

  let ok = 0;
  await Promise.all(
    calls.map(async (c) => {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/analyze-call`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
          body: JSON.stringify({ call_id: c.id }),
        });
        if (r.ok) ok++;
      } catch (_) { /* ignore */ }
    })
  );
  return { analyzed: ok, attempted: calls.length };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // No auth required: gated by service-role secret in cron and admin manual triggers
    const prep = await createPrepTasksForUpcomingEvents();
    const calls = await backfillUnanalyzedCalls();
    return new Response(JSON.stringify({ ok: true, prep, calls }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});