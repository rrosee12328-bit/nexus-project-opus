import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST (webhook payloads)
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const event = body.event; // "invitee.created" or "invitee.canceled"
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
      // Extract event details
      const scheduledEvent = payload.scheduled_event;
      const invitee = payload;

      const eventName = scheduledEvent?.name || "Calendly Meeting";
      const startTime = scheduledEvent?.start_time; // ISO string
      const endTime = scheduledEvent?.end_time;     // ISO string
      const inviteeName = invitee?.name || "";
      const inviteeEmail = invitee?.email || "";
      const calendlyEventUri = scheduledEvent?.uri || "";

      if (!startTime) {
        return new Response(JSON.stringify({ error: "No start_time" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const startDate = new Date(startTime);
      const endDate = endTime ? new Date(endTime) : null;

      const eventDate = startDate.toISOString().split("T")[0];
      const startTimeFormatted = startDate.toISOString().split("T")[1].substring(0, 5);
      const endTimeFormatted = endDate
        ? endDate.toISOString().split("T")[1].substring(0, 5)
        : null;

      const title = inviteeName
        ? `${eventName} — ${inviteeName}`
        : eventName;

      const description = [
        inviteeEmail ? `Invitee: ${inviteeEmail}` : null,
        `calendly_uri:${calendlyEventUri}`,
      ]
        .filter(Boolean)
        .join("\n");

      // Get an admin user to set as created_by
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
        event_date: eventDate,
        start_time: startTimeFormatted,
        end_time: endTimeFormatted,
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

      console.log("Calendly event created:", title, eventDate);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (event === "invitee.canceled") {
      const scheduledEvent = payload.scheduled_event;
      const calendlyEventUri = scheduledEvent?.uri || "";

      if (calendlyEventUri) {
        // Find and delete the matching calendar event by searching description
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

    // Unknown event type — acknowledge anyway
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
