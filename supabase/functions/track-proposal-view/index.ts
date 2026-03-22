import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { proposal_token } = await req.json();
    if (!proposal_token) {
      return new Response(JSON.stringify({ error: "Missing proposal_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find proposal by token
    const { data: proposal, error: fetchErr } = await supabase
      .from("proposals")
      .select("id, client_name, view_count, first_viewed_at")
      .eq("token", proposal_token)
      .single();

    if (fetchErr || !proposal) {
      return new Response(JSON.stringify({ error: "Proposal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isFirstView = proposal.view_count === 0;

    // Insert view log entry
    await supabase.from("proposal_views").insert({
      proposal_id: proposal.id,
      ip_address: ip,
    });

    // Update proposal counters
    const updates: Record<string, unknown> = {
      view_count: (proposal.view_count || 0) + 1,
      last_viewed_at: new Date().toISOString(),
    };
    if (isFirstView) {
      updates.first_viewed_at = new Date().toISOString();
    }
    await supabase.from("proposals").update(updates).eq("id", proposal.id);

    // On first view, notify all admins
    if (isFirstView) {
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (admins && admins.length > 0) {
        const clientLabel = proposal.client_name || "A prospect";
        const notifications = admins.map((a: { user_id: string }) => ({
          user_id: a.user_id,
          title: "Proposal opened",
          body: `${clientLabel} just opened your proposal.`,
          type: "proposal",
          link: "/admin/proposals",
        }));
        await supabase.from("notifications").insert(notifications);

        // Also send email notification to admins
        for (const admin of admins) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("user_id", admin.user_id)
            .single();

          // Get admin email from auth
          const { data: userData } = await supabase.auth.admin.getUserById(admin.user_id);
          const adminEmail = userData?.user?.email;
          if (!adminEmail) continue;

          const msgId = crypto.randomUUID();
          const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Inter, Arial, sans-serif; background-color: #ffffff; padding: 40px 25px;">
<h1 style="font-size: 24px; font-weight: bold; color: #0d0d0d; margin: 0 0 20px;">Proposal Opened 👀</h1>
<p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 10px;">Hi ${profile?.display_name || "there"},</p>
<p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 25px;"><strong style="color: #0d0d0d;">${clientLabel}</strong> just opened the proposal you sent.</p>
<a href="https://nexus-project-opus.lovable.app/admin/proposals" style="display: inline-block; background-color: hsl(213, 100%, 58%); color: #ffffff; font-size: 14px; font-weight: 600; border-radius: 6px; padding: 12px 24px; text-decoration: none;">View Proposals</a>
<p style="font-size: 12px; color: #999999; margin: 30px 0 0;">This is an automated notification from Vektiss.</p></body></html>`;

          await supabase.rpc("enqueue_email", {
            queue_name: "transactional_emails",
            payload: {
              to: adminEmail,
              from: "Vektiss <noreply@mail.vektiss.com>",
              sender_domain: "mail.vektiss.com",
              subject: `Proposal opened by ${clientLabel}`,
              html,
              text: `${clientLabel} just opened the proposal you sent.`,
              purpose: "transactional",
              label: "proposal_opened",
              message_id: msgId,
              queued_at: new Date().toISOString(),
            },
          });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, first_view: isFirstView }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
