import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PORTAL_URL = "https://nexus-project-opus.lovable.app";
const FROM_EMAIL = "Vektiss <noreply@notify.vektiss.com>";
const SENDER_DOMAIN = "notify.vektiss.com";

function buildReminderHtml(title: string, body: string, ctaLabel: string, ctaUrl: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family: Inter, Arial, sans-serif; background-color: #ffffff; padding: 40px 25px;">
  <h1 style="font-size: 24px; font-weight: bold; color: #0d0d0d; margin: 0 0 20px;">${title}</h1>
  <p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 25px;">${body}</p>
  <a href="${ctaUrl}" style="display: inline-block; background-color: hsl(213, 100%, 58%); color: #ffffff; font-size: 14px; font-weight: 600; border-radius: 6px; padding: 12px 24px; text-decoration: none;">${ctaLabel}</a>
  <p style="font-size: 12px; color: #999999; margin: 30px 0 0;">This is an automated reminder from Vektiss.</p>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let totalEnqueued = 0;

    // Helper: check if reminder was already sent in last 24h
    async function wasRecentlySent(type: string, refId: string): Promise<boolean> {
      const { data } = await supabase
        .from("reminder_log")
        .select("id")
        .eq("reminder_type", type)
        .eq("reference_id", refId)
        .gte("sent_at", cutoff)
        .limit(1);
      return (data?.length ?? 0) > 0;
    }

    async function logAndEnqueue(
      type: string,
      refId: string,
      email: string,
      userId: string | null,
      subject: string,
      html: string,
      plainText: string
    ) {
      const msgId = crypto.randomUUID();
      await supabase.from("reminder_log").insert({
        reminder_type: type,
        reference_id: refId,
        recipient_email: email,
        recipient_user_id: userId,
      });
      await supabase.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          to: email,
          from: FROM_EMAIL,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text: plainText,
          purpose: "transactional",
          label: `reminder_${type}`,
          message_id: msgId,
          queued_at: new Date().toISOString(),
        },
      });
      totalEnqueued++;
    }

    // ── 1. UNREAD MESSAGES (client has unread messages from staff for 24h+) ──
    const { data: unreadClients } = await supabase
      .from("messages")
      .select("client_id")
      .is("read_at", null)
      .lt("created_at", cutoff);

    if (unreadClients?.length) {
      const uniqueClientIds = [...new Set(unreadClients.map((m) => m.client_id))];
      for (const clientId of uniqueClientIds) {
        if (await wasRecentlySent("unread_message", clientId)) continue;
        const { data: client } = await supabase
          .from("clients")
          .select("email, name, user_id")
          .eq("id", clientId)
          .single();
        if (!client?.email) continue;

        // Check sender is staff (not the client themselves)
        const { data: unreadFromStaff } = await supabase
          .from("messages")
          .select("id")
          .eq("client_id", clientId)
          .is("read_at", null)
          .lt("created_at", cutoff)
          .neq("sender_id", client.user_id ?? "")
          .limit(1);
        if (!unreadFromStaff?.length) continue;

        const html = buildReminderHtml(
          "You have unread messages",
          `Hi ${client.name ?? "there"}, you have unread messages from your Vektiss team waiting for your review.`,
          "View Messages",
          `${PORTAL_URL}/portal/messages`
        );
        await logAndEnqueue(
          "unread_message",
          clientId,
          client.email,
          client.user_id,
          "Reminder: You have unread messages from Vektiss",
          html,
          `Hi ${client.name ?? "there"}, you have unread messages from your Vektiss team.`
        );
      }
    }

    // ── 2. TASKS AWAITING REVIEW ──
    const { data: reviewTasks } = await supabase
      .from("tasks")
      .select("id, title, assigned_to, updated_at")
      .eq("status", "review")
      .lt("updated_at", cutoff);

    if (reviewTasks?.length) {
      // Get all admin users to notify
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const adminUserIds = adminRoles?.map((r) => r.user_id) ?? [];

      for (const task of reviewTasks) {
        for (const adminId of adminUserIds) {
          const refId = `${task.id}_${adminId}`;
          if (await wasRecentlySent("task_review", refId)) continue;

          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("user_id", adminId)
            .single();

          // Get admin email from auth - use profiles or user_roles
          // We need a way to get the email - check if there's a client with that user_id, otherwise skip
          // Actually for admins, we need their email from auth. We'll use the service role to get it.
          const { data: { user } } = await supabase.auth.admin.getUserById(adminId);
          if (!user?.email) continue;

          const html = buildReminderHtml(
            "Task awaiting your review",
            `The task "<strong>${task.title}</strong>" is waiting for review. Please take a look when you get a chance.`,
            "View Tasks",
            `${PORTAL_URL}/admin`
          );
          await logAndEnqueue(
            "task_review",
            refId,
            user.email,
            adminId,
            `Reminder: "${task.title}" needs review`,
            html,
            `The task "${task.title}" is waiting for review.`
          );
        }
      }
    }

    // ── 3. PROJECTS IN REVIEW PHASE ──
    const { data: reviewProjects } = await supabase
      .from("projects")
      .select("id, name, client_id, updated_at")
      .eq("current_phase", "review")
      .eq("status", "in_progress")
      .lt("updated_at", cutoff);

    if (reviewProjects?.length) {
      for (const project of reviewProjects) {
        const refId = project.id;
        if (await wasRecentlySent("project_review", refId)) continue;

        const { data: client } = await supabase
          .from("clients")
          .select("email, name, user_id")
          .eq("id", project.client_id)
          .single();
        if (!client?.email) continue;

        const html = buildReminderHtml(
          "Your project needs your feedback",
          `Hi ${client.name ?? "there"}, your project "<strong>${project.name}</strong>" is in the review phase and needs your feedback to move forward.`,
          "View Project",
          `${PORTAL_URL}/portal/projects`
        );
        await logAndEnqueue(
          "project_review",
          refId,
          client.email,
          client.user_id,
          `Reminder: "${project.name}" needs your feedback`,
          html,
          `Your project "${project.name}" is in the review phase and needs your feedback.`
        );
      }
    }

    // ── 4. UNPAID INVOICES (clients with balance_due > 0) ──
    const { data: owingClients } = await supabase
      .from("clients")
      .select("id, name, email, user_id, balance_due")
      .gt("balance_due", 0)
      .eq("status", "active");

    if (owingClients?.length) {
      for (const client of owingClients) {
        if (!client.email) continue;
        const refId = client.id;
        if (await wasRecentlySent("unpaid_invoice", refId)) continue;

        const html = buildReminderHtml(
          "Payment reminder",
          `Hi ${client.name ?? "there"}, you have an outstanding balance of <strong>$${Number(client.balance_due).toLocaleString()}</strong>. Please review your payment details at your earliest convenience.`,
          "View Payments",
          `${PORTAL_URL}/portal/payments`
        );
        await logAndEnqueue(
          "unpaid_invoice",
          refId,
          client.email,
          client.user_id,
          "Reminder: You have an outstanding balance with Vektiss",
          html,
          `Hi ${client.name ?? "there"}, you have an outstanding balance of $${client.balance_due}. Please review your payment details.`
        );
      }
    }

    return new Response(
      JSON.stringify({ ok: true, reminders_enqueued: totalEnqueued }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-reminders error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
