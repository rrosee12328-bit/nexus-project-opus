import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignupEmail } from "../_shared/email-templates/signup.tsx";
import { InviteEmail } from "../_shared/email-templates/invite.tsx";
import { MagicLinkEmail } from "../_shared/email-templates/magic-link.tsx";
import { RecoveryEmail } from "../_shared/email-templates/recovery.tsx";
import { EmailChangeEmail } from "../_shared/email-templates/email-change.tsx";
import { ReauthenticationEmail } from "../_shared/email-templates/reauthentication.tsx";

type EmailAction = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "reauthentication";

interface HookPayload {
  user: { email?: string; new_email?: string };
  email_data: {
    token?: string;
    token_hash?: string;
    token_new?: string;
    token_hash_new?: string;
    redirect_to?: string;
    email_action_type: EmailAction;
    site_url?: string;
  };
}

const SUBJECTS: Record<EmailAction, string> = {
  signup: "Confirm your Vektiss email",
  invite: "Activate your Vektiss workspace",
  magiclink: "Your secure Vektiss login link",
  recovery: "Reset your Vektiss password",
  email_change: "Confirm your new Vektiss email",
  reauthentication: "Your Vektiss verification code",
};

const TEMPLATES: Record<EmailAction, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
};

function verificationUrl(data: HookPayload["email_data"]) {
  if (data.email_action_type === "reauthentication") return "https://portal.vektiss.com";
  const tokenHash = data.token_hash || data.token_hash_new;
  if (!tokenHash) throw new Error("Auth hook payload did not include a token hash");
  const redirect = data.redirect_to || "https://portal.vektiss.com";
  const params = new URLSearchParams({
    token: tokenHash,
    type: data.email_action_type,
    redirect_to: redirect,
  });
  return `${Deno.env.get("SUPABASE_URL")!}/auth/v1/verify?${params.toString()}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const configuredSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET");
    if (!configuredSecret) throw new Error("SEND_EMAIL_HOOK_SECRET is not configured");
    const secret = configuredSecret.replace(/^v1,whsec_/, "");
    const rawBody = await req.text();
    const payload = new Webhook(secret).verify(rawBody, Object.fromEntries(req.headers)) as HookPayload;
    const action = payload.email_data.email_action_type;
    const EmailTemplate = TEMPLATES[action];
    if (!EmailTemplate) throw new Error(`Unsupported auth email action: ${action}`);

    const recipient = action === "email_change"
      ? payload.user.new_email || payload.user.email
      : payload.user.email;
    if (!recipient) throw new Error("Auth hook payload did not include a recipient");

    const confirmationUrl = verificationUrl(payload.email_data);
    const props = {
      siteName: "Vektiss",
      siteUrl: "https://portal.vektiss.com",
      recipient,
      confirmationUrl,
      token: payload.email_data.token || payload.email_data.token_new,
      email: payload.user.email,
      newEmail: payload.user.new_email,
    };
    const html = await renderAsync(React.createElement(EmailTemplate, props));
    const text = await renderAsync(React.createElement(EmailTemplate, props), { plainText: true });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const messageId = crypto.randomUUID();
    const { error: logError } = await supabase.from("email_send_log").insert({
      message_id: messageId,
      template_name: `auth_${action}`,
      recipient_email: recipient,
      status: "pending",
    });
    if (logError) throw logError;

    const { error: queueError } = await supabase.rpc("enqueue_email", {
      queue_name: "auth_emails",
      payload: {
        message_id: messageId,
        to: recipient,
        from: "Vektiss <client@vektiss.com>",
        sender_domain: "vektiss.com",
        subject: SUBJECTS[action],
        html,
        text,
        purpose: "transactional",
        label: `auth_${action}`,
        queued_at: new Date().toISOString(),
      },
    });
    if (queueError) {
      await supabase.from("email_send_log").update({ status: "failed", error_message: queueError.message }).eq("message_id", messageId);
      throw queueError;
    }

    return Response.json({});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("auth-email-hook error:", message);
    return Response.json({ error: { http_code: 401, message } }, { status: 401 });
  }
});
