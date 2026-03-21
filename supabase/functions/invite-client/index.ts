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

// ── Onboarding checklist default steps ──
const DEFAULT_STEPS = [
  { step_key: "set_password", title: "Set your password", description: "Create a secure password for your portal account", sort_order: 0 },
  { step_key: "review_project", title: "Review your project", description: "Check out your project timeline and current phase", sort_order: 1 },
  { step_key: "upload_assets", title: "Upload brand assets", description: "Share logos, fonts, and brand guidelines with your team", sort_order: 2 },
  { step_key: "send_message", title: "Send your first message", description: "Introduce yourself or ask a question to your Vektiss team", sort_order: 3 },
  { step_key: "review_payments", title: "Review payment history", description: "Check your payment records and billing status", sort_order: 4 },
];

async function getTemplate(supabase: ReturnType<typeof createClient>, clientType: string | null) {
  // Try client-type-specific template first
  if (clientType) {
    const { data } = await supabase
      .from("onboarding_templates")
      .select("*")
      .eq("client_type", clientType)
      .maybeSingle();
    if (data) return data;
  }
  // Fall back to default template
  const { data } = await supabase
    .from("onboarding_templates")
    .select("*")
    .eq("is_default", true)
    .maybeSingle();
  return data;
}

async function createWelcomeProject(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  clientType: string | null,
) {
  const template = await getTemplate(supabase, clientType);

  const projectName = template?.project_name ?? "Welcome Project";
  const projectDesc = template?.project_description ?? "Your project with Vektiss.";
  const phases = template?.phases ?? ["discovery", "design", "development", "review", "launch", "deploy"];

  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .insert({
      client_id: clientId,
      name: projectName,
      description: projectDesc,
      status: "in_progress",
      current_phase: "discovery",
      progress: 0,
      start_date: new Date().toISOString().split("T")[0],
    })
    .select("id")
    .single();

  if (projectErr) {
    throw new Error(`Failed to create welcome project: ${projectErr.message}`);
  }

  const phaseInserts = phases.map((phase: string, i: number) => ({
    project_id: project.id,
    phase,
    sort_order: i,
    status: i === 0 ? "in_progress" : "not_started",
    started_at: i === 0 ? new Date().toISOString() : null,
  }));

  const { error: phaseErr } = await supabase.from("project_phases").insert(phaseInserts);
  if (phaseErr) throw new Error(`Failed to create project phases: ${phaseErr.message}`);

  await supabase.from("project_activity_log").insert({
    project_id: project.id,
    action: "project_created",
    details: "Welcome project created during onboarding",
  });

  return project.id;
}

async function createOnboardingSteps(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  clientType: string | null,
) {
  const template = await getTemplate(supabase, clientType);
  const templateSteps = (template?.onboarding_steps as Array<{ step_key: string; title: string; description: string; sort_order: number; category?: string }>) ?? null;
  const steps = (templateSteps && templateSteps.length > 0 ? templateSteps : DEFAULT_STEPS).map((step) => ({
    client_id: clientId,
    step_key: step.step_key,
    title: step.title,
    description: step.description,
    sort_order: step.sort_order,
    category: (step as any).category || null,
  }));

  const { error } = await supabase.from("client_onboarding_steps").insert(steps);
  if (error) throw new Error(`Failed to create onboarding steps: ${error.message}`);
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
      .select("id, name, email, user_id, status, type")
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
      .update({ user_id: userId, status: "onboarding" })
      .eq("id", client_id);
    if (updateErr) {
      // Fail closed: delete the orphaned auth user so they can't sign in without a client link
      console.error("Error linking user_id, rolling back auth user:", updateErr);
      await supabase.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: "Failed to link user to client record" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create welcome project and onboarding steps — fail closed on errors
    let projectId: string | null = null;
    try {
      projectId = await createWelcomeProject(supabase, client_id, client.type);
      await createOnboardingSteps(supabase, client_id, client.type);
    } catch (setupErr) {
      console.error("Onboarding setup failed, rolling back auth user:", setupErr);
      await supabase.auth.admin.deleteUser(userId);
      await supabase.from("clients").update({ user_id: null, status: "prospect" }).eq("id", client_id);
      return new Response(JSON.stringify({ error: `Onboarding setup failed: ${setupErr}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const actionLink = await generateRecoveryLink(supabase, client.email);
    const { html, plainText } = buildWelcomeEmail(client.name || "there", actionLink);
    await enqueueWelcomeEmail(supabase, client.email, html, plainText, client_id, userId);

    console.log(`Invited client ${client.name} (${client.email}), user_id: ${userId}, project: ${projectId}`);

    return new Response(
      JSON.stringify({ success: true, user_id: userId, project_id: projectId }),
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
