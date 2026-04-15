import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/microsoft_outlook";
const TIMEZONE = "America/Chicago";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const MICROSOFT_OUTLOOK_API_KEY = Deno.env.get("MICROSOFT_OUTLOOK_API_KEY");
    if (!MICROSOFT_OUTLOOK_API_KEY) throw new Error("MICROSOFT_OUTLOOK_API_KEY is not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Rolling 60-day window: 30 days past, 30 days future
    const now = new Date();
    const startDateTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDateTime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch calendar events from Outlook via Graph API
    const url = `${GATEWAY_URL}/me/calendarView?startDateTime=${encodeURIComponent(startDateTime)}&endDateTime=${encodeURIComponent(endDateTime)}&$top=200&$select=id,subject,start,end,bodyPreview,webLink,isAllDay`;

    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": MICROSOFT_OUTLOOK_API_KEY,
        "Content-Type": "application/json",
        "Prefer": `outlook.timezone="${TIMEZONE}"`,
      },
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Outlook API call failed [${response.status}]: ${errBody}`);
    }

    const data = await response.json();
    const outlookEvents = data.value || [];

    // Get an admin user for created_by
    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1)
      .single();

    if (!adminRole?.user_id) {
      throw new Error("No admin user found");
    }

    let synced = 0;
    let skipped = 0;

    for (const evt of outlookEvents) {
      const outlookId = evt.id;
      const subject = evt.subject || "Outlook Event";
      const startDt = evt.start?.dateTime; // Already in CT due to Prefer header
      const endDt = evt.end?.dateTime;
      const bodyPreview = evt.bodyPreview || "";
      const webLink = evt.webLink || "";
      const isAllDay = evt.isAllDay || false;

      if (!startDt) {
        skipped++;
        continue;
      }

      // Parse the datetime (already in CT from the Prefer header)
      const startDate = new Date(startDt);
      const eventDate = startDt.split("T")[0];
      const startTime = isAllDay ? null : startDt.split("T")[1]?.substring(0, 5) || null;
      const endTime = (isAllDay || !endDt) ? null : endDt.split("T")[1]?.substring(0, 5) || null;

      const description = [
        bodyPreview ? bodyPreview.substring(0, 200) : null,
        webLink ? `outlook_link:${webLink}` : null,
      ].filter(Boolean).join("\n");

      // Upsert by outlook_event_id
      const { error } = await supabase
        .from("calendar_events")
        .upsert(
          {
            outlook_event_id: outlookId,
            title: subject,
            description,
            event_date: eventDate,
            start_time: startTime,
            end_time: endTime,
            event_type: "outlook",
            created_by: adminRole.user_id,
          },
          { onConflict: "outlook_event_id" }
        );

      if (error) {
        console.error("Upsert error for event:", outlookId, error.message);
        skipped++;
      } else {
        synced++;
      }
    }

    // Clean up: remove outlook events from DB that are no longer in Outlook
    const outlookIds = outlookEvents.map((e: any) => e.id).filter(Boolean);
    if (outlookIds.length > 0) {
      // Delete outlook events in our window that are no longer in the Outlook response
      const { data: existingEvents } = await supabase
        .from("calendar_events")
        .select("id, outlook_event_id")
        .eq("event_type", "outlook")
        .gte("event_date", startDateTime.split("T")[0])
        .lte("event_date", endDateTime.split("T")[0]);

      if (existingEvents) {
        const toDelete = existingEvents.filter(
          (e) => e.outlook_event_id && !outlookIds.includes(e.outlook_event_id)
        );
        for (const del of toDelete) {
          await supabase.from("calendar_events").delete().eq("id", del.id);
        }
        if (toDelete.length > 0) {
          console.log(`Removed ${toDelete.length} deleted Outlook events`);
        }
      }
    }

    console.log(`Outlook sync complete: ${synced} synced, ${skipped} skipped`);
    return new Response(JSON.stringify({ ok: true, synced, skipped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Outlook sync error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
