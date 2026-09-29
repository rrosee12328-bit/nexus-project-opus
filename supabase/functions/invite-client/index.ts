import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const PORTAL_URL = "https://portal.vektiss.com";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_STEPS = [
  { step_key: "set_password", title: "Set your password", description: "Create a secure password for your portal account", sort_order: 0 },
  { step_key: "review_project", title: "Review your project", description: "Review your project workspace, timeline, and next action", sort_order: 1 },
  { step_key: "upload_assets", title: "Upload brand assets", description: "Share the files and brand materials needed for your project", sort_order: 2 },
  { step_key: "send_message", title: "Send your first message", description: "Ask a question or introduce yourself to your Vektiss team", sort_order: 3 },
  { step_key: "review_payments", title: "Review billing", description: "Confirm your payment history and billing schedule", sort_order: 4 },
];

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]!));
}

function buildWelcomeEmail(clientName: string, projectName: string, actionLink: string) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#080a0d;color:#f7f8fa;font-family:Arial,sans-serif;padding:32px 18px;">
<div style="max-width:580px;margin:0 auto;border:1px solid #242a33;border-radius:16px;background:#111419;overflow:hidden;">
<div style="padding:24px 28px;border-bottom:1px solid #242a33;font-size:12px;letter-spacing:3px;color:#3291ff;font-weight:700;">VEKTISS</div>
<div style="padding:32px 28px;"><h1 style="font-size:28px;line-height:1.2;margin:0 0 12px;color:#fff;">Your client workspace is ready</h1>
<p style="font-size:15px;line-height:1.7;color:#aab2bf;margin:0 0 22px;">Hi ${escapeHtml(clientName)}, your secure Vektiss workspace has been connected to the project below.</p>
<div style="border:1px solid #2a3544;background:#0c1118;border-radius:12px;padding:18px;margin-bottom:24px;"><div style="font-size:11px;letter-spacing:1.5px;color:#748094;margin-bottom:7px;">YOUR PROJECT</div><div style="font-size:18px;font-weight:700;color:#fff;">${escapeHtml(projectName)}</div></div>
<p style="font-size:14px;line-height:1.7;color:#c7cdd6;margin:0 0 22px;">Set your password to access project updates, approved documents, conversations, meetings, and billing in one place.</p>
<a href="${actionLink}" style="display:inline-block;background:#2588ff;color:#fff;font-size:14px;font-weight:700;border-radius:8px;padding:14px 24px;text-decoration:none;">Activate my workspace</a>
<p style="font-size:12px;line-height:1.6;color:#6f7887;margin:28px 0 0;">This private link is for your Vektiss account. If you were not expecting it, contact client@vektiss.com.</p></div></div></body></html>`;
  return {
    html,
    text: `Hi ${clientName},\n\nYour Vektiss workspace for ${projectName} is ready. Activate it and set your password here:\n${actionLink}\n\nQuestions? Contact client@vektiss.com.\n\nVektiss`,
  };
}

async function requireAdminOrService(req: Request, supabase: ReturnType<typeof createClient>, serviceKey: string) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized");
  if (token === serviceKey) return;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
  if (!role) throw new Error("Only administrators can activate client access");
}

async function findUser(supabase: ReturnType<typeof createClient>, email: string) {
  const normalized = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === normalized);
    if (match) return match;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function ensureClientRole(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase.from("user_roles").select("id").eq("user_id", userId).eq("role", "client").maybeSingle();
  if (!data) {
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "client" });
    if (error) throw error;
  }
}

async function ensureOnboarding(supabase: ReturnType<typeof createClient>, clientId: string, clientType: string | null) {
  const { count, error: countError } = await supabase.from("client_onboarding_steps").select("id", { count: "exact", head: true }).eq("client_id", clientId);
  if (countError) throw countError;
  if ((count || 0) > 0) return;
  let steps = DEFAULT_STEPS;
  if (clientType) {
    const { data } = await supabase.from("onboarding_templates").select("onboarding_steps").eq("client_type", clientType).maybeSingle();
    if (Array.isArray(data?.onboarding_steps) && data.onboarding_steps.length) steps = data.onboarding_steps;
  }
  if (steps === DEFAULT_STEPS) {
    const { data } = await supabase.from("onboarding_templates").select("onboarding_steps").eq("is_default", true).maybeSingle();
    if (Array.isArray(data?.onboarding_steps) && data.onboarding_steps.length) steps = data.onboarding_steps;
  }
  const { error } = await supabase.from("client_onboarding_steps").insert(steps.map((step: any) => ({
    client_id: clientId, step_key: step.step_key, title: step.title, description: step.description,
    sort_order: step.sort_order, category: step.category || null,
  })));
  if (error) throw error;
}

async function generateActivationLink(supabase: ReturnType<typeof createClient>, email: string, projectId: string) {
  const next = encodeURIComponent(`/portal/projects?project=${projectId}`);
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery", email, options: { redirectTo: `${PORTAL_URL}/reset-password?next=${next}` },
  });
  if (error || !data.properties?.action_link) throw error || new Error("Could not create activation link");
  return data.properties.action_link;
}

async function enqueueInvite(supabase: ReturnType<typeof createClient>, to: string, clientId: string, projectId: string, userId: string, html: string, text: string) {
  const messageId = crypto.randomUUID();
  const { error: logError } = await supabase.from("email_send_log").insert({
    template_name: "client_workspace_invite", recipient_email: to, status: "pending", message_id: messageId,
    metadata: { client_id: clientId, project_id: projectId, user_id: userId },
  });
  if (logError) throw logError;
  const { error } = await supabase.rpc("enqueue_email", { queue_name: "transactional_emails", payload: {
    to, from: "Vektiss <client@vektiss.com>", sender_domain: "vektiss.com",
    subject: "Activate your Vektiss client workspace", html, text, purpose: "transactional",
    label: "client_workspace_invite", message_id: messageId, queued_at: new Date().toISOString(),
  }});
  if (error) {
    await supabase.from("email_send_log").update({ status: "failed", error_message: error.message }).eq("message_id", messageId);
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    await requireAdminOrService(req, supabase, serviceKey);
    const { client_id: clientId, project_id: projectId, resend = false } = await req.json();
    if (!clientId || !projectId) return new Response(JSON.stringify({ error: "A client and project are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const [{ data: client, error: clientError }, { data: project, error: projectError }] = await Promise.all([
      supabase.from("clients").select("id, name, email, user_id, status, type").eq("id", clientId).single(),
      supabase.from("projects").select("id, name, client_id").eq("id", projectId).single(),
    ]);
    if (clientError || !client) throw new Error("Client not found");
    if (projectError || !project || project.client_id !== client.id) throw new Error("The selected project does not belong to this client");
    if (!client.email) throw new Error("Add the client's email before activating portal access");

    let userId = client.user_id as string | null;
    let createdUser = false;
    let repairedExistingSignup = false;
    if (!userId) {
      const existing = await findUser(supabase, client.email);
      if (existing) {
        const { data: other } = await supabase.from("clients").select("id").eq("user_id", existing.id).neq("id", client.id).maybeSingle();
        if (other) throw new Error("This email is already connected to another client workspace");
        userId = existing.id;
        repairedExistingSignup = true;
      } else {
        const { data, error } = await supabase.auth.admin.createUser({
          email: client.email, password: `${crypto.randomUUID()}!Aa1`, email_confirm: true,
          user_metadata: { display_name: client.name },
        });
        if (error) throw error;
        userId = data.user.id;
        createdUser = true;
      }
    } else if (!resend) {
      await supabase.from("clients").update({ portal_primary_project_id: projectId, portal_access_status: "active" }).eq("id", client.id);
      return new Response(JSON.stringify({ success: true, already_active: true, user_id: userId, project_id: projectId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    try {
      await ensureClientRole(supabase, userId!);
      await ensureOnboarding(supabase, client.id, client.type);
      const { error } = await supabase.from("clients").update({
        user_id: userId, portal_primary_project_id: projectId, portal_access_status: "invited",
        portal_invited_at: new Date().toISOString(),
        status: client.status === "lead" || client.status === "prospect" ? "onboarding" : client.status,
      }).eq("id", client.id);
      if (error) throw error;
      const actionLink = await generateActivationLink(supabase, client.email, projectId);
      const email = buildWelcomeEmail(client.name || "there", project.name, actionLink);
      await enqueueInvite(supabase, client.email, client.id, projectId, userId!, email.html, email.text);
    } catch (error) {
      if (createdUser && userId) await supabase.auth.admin.deleteUser(userId);
      if (!client.user_id) await supabase.from("clients").update({ user_id: null, portal_access_status: "not_invited", portal_invited_at: null }).eq("id", client.id);
      throw error;
    }

    return new Response(JSON.stringify({ success: true, user_id: userId, project_id: projectId, repaired_existing_signup: repairedExistingSignup, resent: resend }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("invite-client error:", message);
    return new Response(JSON.stringify({ error: message }), { status: /Unauthorized|administrators/.test(message) ? 401 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
