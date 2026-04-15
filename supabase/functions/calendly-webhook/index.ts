import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Convert a UTC ISO string to America/Chicago local date and time parts
function toChicago(isoString: string): { date: string; time: string } {
  const dt = new Date(isoString);
  // Use Intl to get the Chicago local parts
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
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

      if (!startTime) {
        return new Response(JSON.stringify({ error: "No start_time" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Convert UTC to Central Time
      const start = toChicago(startTime);
      const end = endTime ? toChicago(endTime) : null;

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

      const { error } = await supabase.from("calendar_events").insert({
        title,
        description,
        event_date: start.date,
        start_time: start.time,
        end_time: end?.time || null,
        event_type: "calendly",
        created_by: createdBy,
      });

      if (error) {
        console.error("Insert error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("Calendly event created:", title, start.date, start.time, "CT");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (event === "invitee.canceled") {
      const scheduledEvent = payload.scheduled_event;
      const calendlyEventUri = scheduledEvent?.uri || "";

      if (calendlyEventUri) {
        const { data: events } = await supabase
          .from("calendar_events")
          .select("id, description")
          .eq("event_type", "calendly")
          .ilike("description", `%calendly_uri:${calendlyEventUri}%`);

        if (events && events.length > 0) {
          const { error } = await supabase
            .from("calendar_events")
            .delete()
            .eq("id", events[0].id);

          if (error) {
            console.error("Delete error:", error);
          } else {
            console.log("Calendly event canceled and removed:", events[0].id);
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
