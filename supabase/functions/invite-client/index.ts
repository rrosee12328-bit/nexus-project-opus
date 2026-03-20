import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function buildWelcomeEmail(clientName: string, actionLink: string) {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Inter, Arial, sans-serif; background-color: #ffffff; margin: 0; padding: 40px 25px;">
  <div style="max-width: 560px; margin: 0 auto;">
    <h1 style="font-size: 28px; font-weight: bold; color: #0d0d0d; margin: 0 0 8px;">Welcome to Vektiss</h1>
    <p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 24px;">Your client portal is ready.</p>
    <p style="font-size: 14px; color: #333; line-height: 1.7; margin: 0 0 16px;">Hi ${clientName},</p>
    <p style="font-size: 14px; color: #333; line-height: 1.7; margin: 0 0 24px;">
      Your Vektiss client portal account is ready. Here's what you can do once you're inside:
    </p>
    <div style="background-color: #f5f5f5; border-radius: 8px; padding: 20px; margin: 0 0 28px;">
      <p style="font-size: 13px; color: #333; line-height: 1.8; margin: 0;">
        📁 <strong>Projects</strong> — Track progress and milestones<br/>
        💬 <strong>Messages</strong> — Communicate directly with your team<br/>
        💳 <strong>Payments</strong> — View payment history<br/>
        📂 <strong>Assets</strong> — Access shared files and deliverables
      </p>
    </div>
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

  const plainText = `Welcome to Vektiss!\n\nHi ${clientName},\n\nYour client portal account is ready. Set your password here: ${actionLink}\n\nOnce logged in you can track projects, send messages, view payments, and access shared assets.\n\n— Vektiss`;

  return { html, plainText };
}

async function enqueueWelcomeEmail(
  supabase: ReturnType<typeof createClient>,
  email: string,
  html: string,
  plainText: string,
  clientId: string,
  userId: string,
) {
  const msgId = crypto.randomUUID();
  const { error: enqueueErr } = await supabase.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      to: email,
      from: "Vektiss <noreply@mail.vektiss.com>",
      sender_domain: "mail.vektiss.com",
      subject: "Welcome to Vektiss — Set Your Password",
      html,
      text: plainText,
      purpose: "transactional",
      label: "client_welcome_invite",
      message_id: msgId,
      queued_at: new Date().toISOString(),
    },
  });
  if (enqueueErr) console.error("Error enqueuing welcome email:", enqueueErr);

  await supabase.from("email_send_log").insert({
    template_name: "client_welcome_invite",
    recipient_email: email,
    status: "pending",
    message_id: msgId,
    metadata: { client_id: clientId, user_id: userId },
  });
}

async function generateRecoveryLink(
  supabase: ReturnType<typeof createClient>,
  email: string,
) {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: "https://nexus-project-opus.lovable.app/reset-password",
    },
  });
  if (error) throw error;
  return data.properties?.action_link ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { client_id, resend } = await req.json();
    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, name, email, user_id, status")
      .eq("id", client_id)
      .single();

    if (clientErr || !client) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!client.email) {
      return new Response(JSON.stringify({ error: "Client has no email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resend: generate fresh recovery link for existing user
    if (client.user_id && resend) {
      const actionLink = await generateRecoveryLink(supabase, client.email);
      const { html, plainText } = buildWelcomeEmail(client.name || "there", actionLink);
      await enqueueWelcomeEmail(supabase, client.email, html, plainText, client_id, client.user_id);
      console.log(`Resent invite to ${client.email}`);
      return new Response(
        JSON.stringify({ success: true, resent: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Already invited, not a resend — skip
    if (client.user_id) {
      return new Response(
        JSON.stringify({ message: "Client already has an account", user_id: client.user_id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // New invite: create auth user
    const randomPassword = crypto.randomUUID() + "!Aa1";
    const { data: newUser, error: createErr } =
      await supabase.auth.admin.createUser({
        email: client.email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: { display_name: client.name },
      });

    if (createErr) {
      console.error("Error creating user:", createErr);
      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = newUser.user.id;

    const { error: updateErr } = await supabase
      .from("clients")
      .update({ user_id: userId })
      .eq("id", client_id);
    if (updateErr) console.error("Error linking user_id:", updateErr);

    const actionLink = await generateRecoveryLink(supabase, client.email);
    const { html, plainText } = buildWelcomeEmail(client.name || "there", actionLink);
    await enqueueWelcomeEmail(supabase, client.email, html, plainText, client_id, userId);

    console.log(`Invited client ${client.name} (${client.email}), user_id: ${userId}`);

    return new Response(
      JSON.stringify({ success: true, user_id: userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("invite-client error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
