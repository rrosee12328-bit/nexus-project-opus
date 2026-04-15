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

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
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

    const body = await req.json();
    const { calendar_event_id, action } = body; // action: "create", "update", "delete"

    if (!calendar_event_id) {
      return new Response(JSON.stringify({ error: "Missing calendar_event_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the calendar event from DB
    const { data: calEvent, error: fetchError } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("id", calendar_event_id)
      .single();

    if (fetchError || !calEvent) {
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Don't push outlook-sourced events back to Outlook
    if (calEvent.event_type === "outlook" && action !== "delete") {
      return new Response(JSON.stringify({ ok: true, skipped: "outlook-sourced event" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers = {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": MICROSOFT_OUTLOOK_API_KEY,
      "Content-Type": "application/json",
    };

    if (action === "delete" && calEvent.outlook_event_id) {
      // Delete from Outlook
      const resp = await fetch(`${GATEWAY_URL}/me/events/${calEvent.outlook_event_id}`, {
        method: "DELETE",
        headers,
      });
      if (!resp.ok && resp.status !== 404) {
        const errBody = await resp.text();
        throw new Error(`Outlook DELETE failed [${resp.status}]: ${errBody}`);
      }
      // Clear the outlook_event_id
      await supabase
        .from("calendar_events")
        .update({ outlook_event_id: null })
        .eq("id", calendar_event_id);

      return new Response(JSON.stringify({ ok: true, action: "deleted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build Outlook event payload (times are in CT)
    const startDateTime = calEvent.start_time
      ? `${calEvent.event_date}T${calEvent.start_time}:00`
      : `${calEvent.event_date}T00:00:00`;
    const endDateTime = calEvent.end_time
      ? `${calEvent.event_date}T${calEvent.end_time}:00`
      : calEvent.start_time
        ? `${calEvent.event_date}T${calEvent.start_time.split(":").map((v: string, i: number) => i === 0 ? String(Number(v) + 1).padStart(2, "0") : v).join(":")}:00`
        : `${calEvent.event_date}T23:59:59`;

    const isAllDay = !calEvent.start_time;
    const outlookPayload: any = {
      subject: calEvent.title,
      body: {
        contentType: "Text",
        content: calEvent.description || "",
      },
      start: {
        dateTime: startDateTime,
        timeZone: TIMEZONE,
      },
      end: {
        dateTime: endDateTime,
        timeZone: TIMEZONE,
      },
      isAllDay,
    };

    if (calEvent.outlook_event_id && action === "update") {
      // Update existing Outlook event
      const resp = await fetch(`${GATEWAY_URL}/me/events/${calEvent.outlook_event_id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(outlookPayload),
      });

      if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`Outlook PATCH failed [${resp.status}]: ${errBody}`);
      }

      return new Response(JSON.stringify({ ok: true, action: "updated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create new Outlook event
    const resp = await fetch(`${GATEWAY_URL}/me/events`, {
      method: "POST",
      headers,
      body: JSON.stringify(outlookPayload),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`Outlook POST failed [${resp.status}]: ${errBody}`);
    }

    const created = await resp.json();

    // Store the Outlook event ID back on our record
    if (created.id) {
      await supabase
        .from("calendar_events")
        .update({ outlook_event_id: created.id })
        .eq("id", calendar_event_id);
    }

    return new Response(JSON.stringify({ ok: true, action: "created", outlook_id: created.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Push Outlook event error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
