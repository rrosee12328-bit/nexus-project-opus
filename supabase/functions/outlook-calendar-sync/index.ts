import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://connector-gateway.lovable.dev/microsoft_outlook";
const VEKTISS_CLIENT_ID = "7662c4e3-bf78-494e-b203-40a9ba06fb27";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OUTLOOK_KEY = Deno.env.get("MICROSOFT_OUTLOOK_API_KEY_1") || Deno.env.get("MICROSOFT_OUTLOOK_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
    if (!OUTLOOK_KEY) throw new Error("MICROSOFT_OUTLOOK_API_KEY missing");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Window: 30 days back, 60 days forward
    const start = new Date(); start.setDate(start.getDate() - 30);
    const end = new Date(); end.setDate(end.getDate() + 60);
    const url = `${GATEWAY}/me/calendarView?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$top=500&$orderby=start/dateTime`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": OUTLOOK_KEY,
        Prefer: 'outlook.timezone="UTC"',
      },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`Outlook fetch [${res.status}]: ${JSON.stringify(json)}`);

    const events = json.value || [];
    let upserted = 0, skipped = 0;

    for (const ev of events) {
      if (ev.isCancelled) continue;
      const startDt = new Date(ev.start?.dateTime + "Z");
      const endDt = new Date(ev.end?.dateTime + "Z");
      if (isNaN(startDt.getTime())) { skipped++; continue; }

      const event_date = startDt.toISOString().slice(0, 10);
      const start_time = startDt.toISOString().slice(11, 19);
      const end_time = endDt.toISOString().slice(11, 19);
      const description = (ev.bodyPreview || "").slice(0, 500);

      // Try to match a client by attendee email
      let client_id: string | null = VEKTISS_CLIENT_ID;
      const attendeeEmails: string[] = (ev.attendees || [])
        .map((a: any) => a?.emailAddress?.address?.toLowerCase())
        .filter(Boolean);
      if (attendeeEmails.length) {
        const { data: match } = await admin
          .from("clients")
          .select("id")
          .in("email", attendeeEmails)
          .limit(1)
          .maybeSingle();
        if (match?.id) client_id = match.id;
      }

      const row = {
        title: ev.subject || "(No title)",
        description,
        event_date,
        start_time,
        end_time,
        event_type: "meeting",
        client_id,
        outlook_event_id: ev.id,
      };

      const { error } = await admin
        .from("calendar_events")
        .upsert(row, { onConflict: "outlook_event_id" });
      if (error) { console.error("upsert error", error, ev.id); skipped++; continue; }
      upserted++;
    }

    return new Response(JSON.stringify({ success: true, upserted, skipped, total: events.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});