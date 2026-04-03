import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function buildReinviteEmail(displayName: string, actionLink: string, role: string) {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Inter, Arial, sans-serif; background-color: #ffffff; margin: 0; padding: 40px 25px;">
  <div style="max-width: 560px; margin: 0 auto;">
    <h1 style="font-size: 28px; font-weight: bold; color: #0d0d0d; margin: 0 0 8px;">Reminder: Set Up Your Vektiss Account</h1>
    <p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 24px;">Your ${role} account is waiting for you.</p>
    <p style="font-size: 14px; color: #333; line-height: 1.7; margin: 0 0 16px;">Hi ${displayName},</p>
    <p style="font-size: 14px; color: #333; line-height: 1.7; margin: 0 0 24px;">
      This is a reminder that you have a pending invitation to join the Vektiss portal as <strong>${role}</strong>. Click the button below to set your password and get started:
    </p>
    <a href="${actionLink}" 
       style="display: inline-block; background-color: hsl(213, 100%, 58%); color: #ffffff; font-size: 14px; font-weight: 600; border-radius: 6px; padding: 14px 28px; text-decoration: none;">
      Set Your Password
    </a>
    <p style="font-size: 12px; color: #999; margin: 32px 0 0; line-height: 1.6;">
      If you didn't expect this email, you can safely ignore it.<br/>
      This is an automated message from Vektiss.
    </p>
  </div>
</body>
</html>`;

  const plainText = `Reminder: Set Up Your Vektiss Account\n\nHi ${displayName},\n\nYou have a pending invitation to join the Vektiss portal as ${role}. Set your password here: ${actionLink}\n\n— Vektiss`;

  return { html, plainText };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub as string;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller is admin
    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();

    if (!callerRole) {
      return new Response(JSON.stringify({ error: "Only admins can resend invites" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user details
    const { data: targetUser, error: userErr } = await adminClient.auth.admin.getUserById(user_id);
    if (userErr || !targetUser?.user) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user has never signed in
    if (targetUser.user.last_sign_in_at) {
      return new Response(JSON.stringify({ error: "User has already signed in" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = targetUser.user.email!;
    const displayName = targetUser.user.user_metadata?.display_name || email.split("@")[0];

    // Get role
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user_id)
      .maybeSingle();

    const role = roleData?.role || "admin";

    // Generate recovery link
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: "https://portal.vektiss.com/reset-password",
      },
    });

    if (linkErr) {
      console.error("Error generating recovery link:", linkErr);
      return new Response(JSON.stringify({ error: "Failed to generate invite link" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const actionLink = linkData?.properties?.action_link ?? "";

    // Send reinvite email via queue
    if (actionLink) {
      const { html, plainText } = buildReinviteEmail(displayName, actionLink, role);
      const msgId = crypto.randomUUID();
      await adminClient.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          to: email,
          from: "Vektiss <noreply@mail.vektiss.com>",
          sender_domain: "mail.vektiss.com",
          subject: `Reminder: Set up your Vektiss ${role} account`,
          html,
          text: plainText,
          purpose: "transactional",
          label: "admin_reinvite",
          message_id: msgId,
          queued_at: new Date().toISOString(),
        },
      });

      await adminClient.from("email_send_log").insert({
        template_name: "admin_reinvite",
        recipient_email: email,
        status: "pending",
        message_id: msgId,
        metadata: { user_id, role, resent_by: callerId },
      });
    }

    console.log(`Resent invite to ${role} user: ${email} (${user_id})`);

    return new Response(
      JSON.stringify({ success: true, invite_link: actionLink || null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("resend-admin-invite error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
