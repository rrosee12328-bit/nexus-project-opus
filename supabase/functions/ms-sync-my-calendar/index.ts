import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VEKTISS_CLIENT_ID = "7662c4e3-bf78-494e-b203-40a9ba06fb27";

async function refreshIfNeeded(admin: any, row: any) {
  if (new Date(row.expires_at).getTime() > Date.now() + 30_000) return row.access_token;
  const MS_CLIENT_ID = Deno.env.get("MS_CLIENT_ID")!;
  const MS_CLIENT_SECRET = Deno.env.get("MS_CLIENT_SECRET")!;
  const MS_TENANT_ID = Deno.env.get("MS_TENANT_ID") || "common";
  const res = await fetch(`https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
      scope: "offline_access User.Read Calendars.ReadWrite",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Refresh failed: ${JSON.stringify(json)}`);
  await admin.from("ms_outlook_tokens").update({
    access_token: json.access_token,
    refresh_token: json.refresh_token || row.refresh_token,
    expires_at: new Date(Date.now() + (json.expires_in - 60) * 1000).toISOString(),
  }).eq("user_id", row.user_id);
  return json.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: tokenRow } = await admin.from("ms_outlook_tokens").select("*").eq("user_id", userRes.user.id).maybeSingle();
    if (!tokenRow) return new Response(JSON.stringify({ error: "outlook_not_connected" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const accessToken = await refreshIfNeeded(admin, tokenRow);

    const start = new Date(); start.setDate(start.getDate() - 30);
    const end = new Date(); end.setDate(end.getDate() + 60);
    const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$top=500&$orderby=start/dateTime`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`Graph fetch [${res.status}]: ${JSON.stringify(json)}`);

    // Convert a UTC ISO datetime to America/Chicago wall-clock parts (DST-aware: CDT/CST)
    const TZ = "America/Chicago";
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    const toChicago = (utc: Date) => {
      const parts = Object.fromEntries(fmt.formatToParts(utc).map(p => [p.type, p.value]));
      const hour = parts.hour === "24" ? "00" : parts.hour;
      return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        time: `${hour}:${parts.minute}:${parts.second}`,
      };
    };

    const events = json.value || [];
    let upserted = 0, skipped = 0;
    for (const ev of events) {
      if (ev.isCancelled) continue;
      // Graph returns UTC by default: "2026-05-04T18:00:00.0000000"
      const startStr: string = ev.start?.dateTime || "";
      const endStr: string = ev.end?.dateTime || "";
      const startDt = new Date(startStr + "Z");
      const endDt = new Date(endStr + "Z");
      if (isNaN(startDt.getTime())) { skipped++; continue; }
      const s = toChicago(startDt);
      const e = toChicago(endDt);
      const event_date = s.date;
      const start_time = s.time;
      const end_time = e.time;

      let client_id: string | null = VEKTISS_CLIENT_ID;
      const attendeeEmails: string[] = (ev.attendees || []).map((a: any) => a?.emailAddress?.address?.toLowerCase()).filter(Boolean);
      if (attendeeEmails.length) {
        const { data: match } = await admin.from("clients").select("id").in("email", attendeeEmails).limit(1).maybeSingle();
        if (match?.id) client_id = match.id;
      }

      const row = {
        title: ev.subject || "(No title)",
        description: (ev.bodyPreview || "").slice(0, 500),
        event_date,
        start_time,
        end_time,
        event_type: "outlook",
        client_id,
        outlook_event_id: ev.id,
        outlook_user_id: userRes.user.id,
        created_by: userRes.user.id,
      };
      const { error } = await admin.from("calendar_events").upsert(row, { onConflict: "outlook_event_id" });
      if (error) { console.error("upsert", error); skipped++; continue; }
      upserted++;
    }

    await admin.from("ms_outlook_tokens").update({ last_synced_at: new Date().toISOString() }).eq("user_id", userRes.user.id);

    return new Response(JSON.stringify({ success: true, upserted, skipped, total: events.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});