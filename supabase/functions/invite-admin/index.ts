import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function buildAdminInviteEmail(displayName: string, actionLink: string) {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Inter, Arial, sans-serif; background-color: #ffffff; margin: 0; padding: 40px 25px;">
  <div style="max-width: 560px; margin: 0 auto;">
    <h1 style="font-size: 28px; font-weight: bold; color: #0d0d0d; margin: 0 0 8px;">You've been invited to Vektiss</h1>
    <p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 24px;">You've been granted admin access to the Vektiss portal.</p>
    <p style="font-size: 14px; color: #333; line-height: 1.7; margin: 0 0 16px;">Hi ${displayName},</p>
    <p style="font-size: 14px; color: #333; line-height: 1.7; margin: 0 0 24px;">
      An administrator has invited you to join the Vektiss portal with <strong>admin</strong> privileges. You'll have full access to manage clients, projects, finances, and team operations.
    </p>
    <p style="font-size: 14px; color: #333; line-height: 1.7; margin: 0 0 24px;">
      Click the button below to set your password and log in:
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

  const plainText = `You've been invited to Vektiss!\n\nHi ${displayName},\n\nAn administrator has invited you to the Vektiss portal with admin privileges. Set your password here: ${actionLink}\n\n— Vektiss`;

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

    // Verify the caller is an admin
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
      return new Response(JSON.stringify({ error: "Only admins can invite other admins" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, display_name, role } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetRole = role === "ops" ? "ops" : "admin";
    const name = display_name || email.split("@")[0];

    // Create the auth user
    const randomPassword = crypto.randomUUID() + "!Aa1";
    const { data: newUser, error: createErr } =
      await adminClient.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: { display_name: name },
      });

    if (createErr) {
      console.error("Error creating user:", createErr);
      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = newUser.user.id;

    // The handle_new_user trigger creates a profile and assigns 'client' role.
    // We need to update the role to admin/ops.
    const { error: roleErr } = await adminClient
      .from("user_roles")
      .update({ role: targetRole })
      .eq("user_id", userId);

    if (roleErr) {
      console.error("Error updating role:", roleErr);
      await adminClient.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: "Failed to assign role" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate a password reset link so they can set their own password
    const { data: linkData, error: linkErr } =
      await adminClient.auth.admin.generateLink({
        type: "recovery",
        email,
        options: {
          redirectTo: "https://nexus-project-opus.lovable.app/reset-password",
        },
      });

    if (linkErr) {
      console.error("Error generating recovery link:", linkErr);
      // User is created but we couldn't send the email — not fatal
    }

    const actionLink = linkData?.properties?.action_link ?? "";

    // Send invite email via queue
    if (actionLink) {
      const { html, plainText } = buildAdminInviteEmail(name, actionLink);
      const msgId = crypto.randomUUID();
      await adminClient.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          to: email,
          from: "Vektiss <noreply@mail.vektiss.com>",
          sender_domain: "mail.vektiss.com",
          subject: `You've been invited to Vektiss as ${targetRole}`,
          html,
          text: plainText,
          purpose: "transactional",
          label: "admin_invite",
          message_id: msgId,
          queued_at: new Date().toISOString(),
        },
      });

      await adminClient.from("email_send_log").insert({
        template_name: "admin_invite",
        recipient_email: email,
        status: "pending",
        message_id: msgId,
        metadata: { user_id: userId, role: targetRole, invited_by: callerId },
      });
    }

    console.log(`Invited ${targetRole} user: ${email} (${userId})`);

    return new Response(
      JSON.stringify({ success: true, user_id: userId, role: targetRole }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("invite-admin error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
