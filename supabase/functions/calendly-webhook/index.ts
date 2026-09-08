import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function toZone(isoString: string, timeZone: string): { date: string; time: string } {
  const dt = new Date(isoString);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(dt);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const time = `${get("hour")}:${get("minute")}`;
  return { date, time };
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index++) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

async function verifyCalendlySignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  const signingKey = Deno.env.get("CALENDLY_WEBHOOK_SIGNING_KEY");
  if (!signingKey || !signatureHeader) return false;
  const values = Object.fromEntries(signatureHeader.split(",").map((part) => part.trim().split("=")));
  const timestamp = values.t;
  const signature = values.v1;
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 180) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(signingKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));
  return constantTimeEqual(expected, signature);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    if (!await verifyCalendlySignature(rawBody, req.headers.get("calendly-webhook-signature"))) {
      return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = JSON.parse(rawBody);
    const event = body.event;
    const payload = body.payload;

    if (!event || !payload) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (event === "invitee.created") {
      const scheduledEvent = payload.scheduled_event;
      const invitee = payload;

      const eventName = scheduledEvent?.name || "Calendly Meeting";
      const startTime = scheduledEvent?.start_time;
      const endTime = scheduledEvent?.end_time;
      const inviteeName = invitee?.name || "";
      const inviteeEmail = invitee?.email || "";
      const calendlyEventUri = scheduledEvent?.uri || "";
      const eventTimezone = invitee?.timezone || scheduledEvent?.timezone || "America/Chicago";
      const joinUrl = scheduledEvent?.location?.join_url || scheduledEvent?.location?.location || null;
      const cancelUrl = invitee?.cancel_url || null;
      const rescheduleUrl = invitee?.reschedule_url || null;

      if (!startTime) {
        return new Response(JSON.stringify({ error: "No start_time" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const start = toZone(startTime, eventTimezone);
      const end = endTime ? toZone(endTime, eventTimezone) : null;

      const title = inviteeName
        ? `${eventName} — ${inviteeName}`
        : eventName;

      const description = [
        inviteeEmail ? `Invitee: ${inviteeEmail}` : null,
        `calendly_uri:${calendlyEventUri}`,
      ]
        .filter(Boolean)
        .join("\n");

      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin")
        .limit(1)
        .single();

      const createdBy = adminRole?.user_id;
      if (!createdBy) {
        console.error("No admin user found to assign as created_by");
        return new Response(JSON.stringify({ error: "No admin user" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Auto-link to client by invitee email
      let linkedClientId: string | null = null;
      if (inviteeEmail) {
        const { data: matchClient } = await supabase
          .from("clients")
          .select("id")
          .ilike("email", inviteeEmail)
          .maybeSingle();
        linkedClientId = matchClient?.id ?? null;
      }

      const eventRecord = {
        title,
        description,
        event_date: start.date,
        start_time: startTime,
        end_time: endTime || null,
        event_type: "calendly",
        created_by: createdBy,
        client_id: linkedClientId,
        external_event_uri: calendlyEventUri || null,
        external_starts_at: startTime,
        event_timezone: eventTimezone,
        join_url: joinUrl,
        cancel_url: cancelUrl,
        reschedule_url: rescheduleUrl,
        cancelled_at: null,
        client_reminders_enabled_at: linkedClientId ? new Date().toISOString() : null,
      };

      const { data: existing } = calendlyEventUri
        ? await supabase.from("calendar_events").select("id").eq("external_event_uri", calendlyEventUri).maybeSingle()
        : { data: null };
      const { error } = existing?.id
        ? await supabase.from("calendar_events").update(eventRecord).eq("id", existing.id)
        : await supabase.from("calendar_events").insert(eventRecord);

      if (error) {
        console.error("Insert error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("Calendly event stored:", title, start.date, start.time, eventTimezone);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (event === "invitee.canceled") {
      const scheduledEvent = payload.scheduled_event;
      const calendlyEventUri = scheduledEvent?.uri || "";

      if (calendlyEventUri) {
        let { data: events } = await supabase
          .from("calendar_events")
          .select("id, description")
          .eq("event_type", "calendly")
          .eq("external_event_uri", calendlyEventUri);
        if (!events?.length) {
          const fallback = await supabase.from("calendar_events").select("id, description")
            .eq("event_type", "calendly").ilike("description", `%calendly_uri:${calendlyEventUri}%`);
          events = fallback.data;
        }

        if (events && events.length > 0) {
          const { error } = await supabase
            .from("calendar_events")
            .update({ cancelled_at: new Date().toISOString(), client_reminders_enabled_at: null })
            .eq("id", events[0].id);

          if (error) {
            console.error("Delete error:", error);
          } else {
            console.log("Calendly event canceled:", events[0].id);
          }
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, ignored: event }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
