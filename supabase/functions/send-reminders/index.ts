import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PORTAL_URL = "https://nexus-project-opus.lovable.app";
const FROM_EMAIL = "Vektiss <noreply@mail.vektiss.com>";
const SENDER_DOMAIN = "mail.vektiss.com";

/* ── Branded email shell ── */
function wrapEmail(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f7f7f8;font-family:'Inter',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f7f8;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="background:linear-gradient(135deg, hsl(213,100%,58%), hsl(213,100%,45%));padding:28px 32px;">
    <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Vektiss</h1>
  </td></tr>
  <tr><td style="padding:32px;">
    ${content}
  </td></tr>
  <tr><td style="padding:16px 32px 24px;border-top:1px solid #eee;">
    <p style="margin:0;font-size:11px;color:#999;text-align:center;">This is an automated notification from Vektiss. <a href="${PORTAL_URL}" style="color:hsl(213,100%,58%);text-decoration:none;">Open Portal</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function buildReminderHtml(title: string, body: string, ctaLabel: string, ctaUrl: string): string {
  return wrapEmail(`
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0d0d0d;">${title}</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.7;">${body}</p>
    <a href="${ctaUrl}" style="display:inline-block;background-color:hsl(213,100%,58%);color:#ffffff;font-size:14px;font-weight:600;border-radius:8px;padding:12px 28px;text-decoration:none;">
      ${ctaLabel}
    </a>
  `);
}

function buildDigestHtml(name: string, sections: { icon: string; title: string; items: string[]; cta: string; url: string }[]): string {
  const sectionHtml = sections.map(s => `
    <div style="margin:0 0 24px;padding:16px;background:#f9f9fb;border-radius:8px;border-left:4px solid hsl(213,100%,58%);">
      <h3 style="margin:0 0 8px;font-size:15px;font-weight:600;color:#0d0d0d;">${s.icon} ${s.title}</h3>
      <ul style="margin:0;padding:0 0 0 16px;font-size:13px;color:#555;line-height:1.8;">
        ${s.items.map(i => `<li>${i}</li>`).join('')}
      </ul>
      <a href="${s.url}" style="display:inline-block;margin-top:10px;font-size:12px;font-weight:600;color:hsl(213,100%,58%);text-decoration:none;">${s.cta} →</a>
    </div>
  `).join('');

  return wrapEmail(`
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0d0d0d;">Good morning${name ? ', ' + name : ''}!</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6;">Here's your daily summary from Vektiss.</p>
    ${sectionHtml}
  `);
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

    // Check if today is a weekday (Mon-Fri). Payments send any day; all others only weekdays.
    const dayOfWeek = new Date().getUTCDay(); // 0=Sun, 6=Sat
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

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
      type: string, refId: string, email: string, userId: string | null,
      subject: string, html: string, plainText: string
    ) {
      const msgId = crypto.randomUUID();
      await supabase.from("reminder_log").insert({
        reminder_type: type, reference_id: refId,
        recipient_email: email, recipient_user_id: userId,
      });
      await supabase.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          to: email, from: FROM_EMAIL, sender_domain: SENDER_DOMAIN,
          subject, html, text: plainText, purpose: "transactional",
          run_id: msgId, label: `reminder_${type}`,
          message_id: msgId, queued_at: new Date().toISOString(),
        },
      });
      totalEnqueued++;
    }

    // ── Load notification preferences (for checking email opt-outs) ──
    const { data: allPrefs } = await supabase
      .from("notification_preferences")
      .select("*");
    const prefsMap: Record<string, any> = {};
    for (const p of allPrefs ?? []) prefsMap[p.user_id] = p;

    function isEmailEnabled(userId: string | null, category: string): boolean {
      if (!userId) return true;
      const p = prefsMap[userId];
      if (!p) return true;
      const key = `email_${category}`;
      return p[key] !== false;
    }

    // ── 1. UNREAD MESSAGES (weekdays only) ──
    if (isWeekday) {
    const { data: unreadClients } = await supabase
      .from("messages").select("client_id")
      .is("read_at", null).lt("created_at", cutoff);

    if (unreadClients?.length) {
      const uniqueClientIds = [...new Set(unreadClients.map((m) => m.client_id))];
      for (const clientId of uniqueClientIds) {
        if (await wasRecentlySent("unread_message", clientId)) continue;
        const { data: client } = await supabase
          .from("clients").select("email, name, user_id")
          .eq("id", clientId).single();
        if (!client?.email) continue;
        if (!isEmailEnabled(client.user_id, "messages")) continue;

        const { data: unreadFromStaff } = await supabase
          .from("messages").select("id")
          .eq("client_id", clientId).is("read_at", null)
          .lt("created_at", cutoff).neq("sender_id", client.user_id ?? "")
          .limit(1);
        if (!unreadFromStaff?.length) continue;

        const html = buildReminderHtml(
          "You have unread messages",
          `Hi ${client.name ?? "there"}, you have unread messages from your Vektiss team waiting for your review.`,
          "View Messages", `${PORTAL_URL}/portal/messages`
        );
        await logAndEnqueue("unread_message", clientId, client.email, client.user_id,
          "Reminder: You have unread messages from Vektiss", html,
          `Hi ${client.name ?? "there"}, you have unread messages from your Vektiss team.`
        );
      }
    }
    } // end weekday guard for unread messages

    // ── 2. TASKS AWAITING REVIEW (weekdays only) ──
    if (isWeekday) {
    const { data: reviewTasks } = await supabase
      .from("tasks").select("id, title, assigned_to, updated_at")
      .eq("status", "review").lt("updated_at", cutoff);

    if (reviewTasks?.length) {
      const { data: adminRoles } = await supabase
        .from("user_roles").select("user_id").eq("role", "admin");
      const adminUserIds = adminRoles?.map((r) => r.user_id) ?? [];

      for (const task of reviewTasks) {
        for (const adminId of adminUserIds) {
          if (!isEmailEnabled(adminId, "tasks")) continue;
          const refId = `${task.id}_${adminId}`;
          if (await wasRecentlySent("task_review", refId)) continue;
          const { data: { user } } = await supabase.auth.admin.getUserById(adminId);
          if (!user?.email) continue;

          const html = buildReminderHtml(
            "Task awaiting your review",
            `The task "<strong>${task.title}</strong>" is waiting for review.`,
            "View Tasks", `${PORTAL_URL}/admin`
          );
          await logAndEnqueue("task_review", refId, user.email, adminId,
            `Reminder: "${task.title}" needs review`, html,
            `The task "${task.title}" is waiting for review.`
          );
        }
      }
    }

    } // end weekday guard for tasks review

    // ── 3. PROJECTS IN REVIEW PHASE (weekdays only) ──
    if (isWeekday) {
    const { data: reviewProjects } = await supabase
      .from("projects").select("id, name, client_id, updated_at")
      .eq("current_phase", "review").eq("status", "in_progress")
      .lt("updated_at", cutoff);

    if (reviewProjects?.length) {
      for (const project of reviewProjects) {
        if (await wasRecentlySent("project_review", project.id)) continue;
        const { data: client } = await supabase
          .from("clients").select("email, name, user_id")
          .eq("id", project.client_id).single();
        if (!client?.email) continue;
        if (!isEmailEnabled(client.user_id, "projects")) continue;

        const html = buildReminderHtml(
          "Your project needs your feedback",
          `Hi ${client.name ?? "there"}, your project "<strong>${project.name}</strong>" is in the review phase and needs your feedback.`,
          "View Project", `${PORTAL_URL}/portal/projects`
        );
        await logAndEnqueue("project_review", project.id, client.email, client.user_id,
          `Reminder: "${project.name}" needs your feedback`, html,
          `Your project "${project.name}" is in the review phase and needs your feedback.`
        );
      }
    }

    } // end weekday guard for projects review

    // ── 4. UNPAID INVOICES (sends any day) ──
    const { data: owingClients } = await supabase
      .from("clients").select("id, name, email, user_id, balance_due")
      .gt("balance_due", 0).eq("status", "active");

    if (owingClients?.length) {
      for (const client of owingClients) {
        if (!client.email) continue;
        if (!isEmailEnabled(client.user_id, "payments")) continue;
        if (await wasRecentlySent("unpaid_invoice", client.id)) continue;

        const html = buildReminderHtml(
          "Payment reminder",
          `Hi ${client.name ?? "there"}, you have an outstanding balance of <strong>$${Number(client.balance_due).toLocaleString()}</strong>.`,
          "View Payments", `${PORTAL_URL}/portal/payments`
        );
        await logAndEnqueue("unpaid_invoice", client.id, client.email, client.user_id,
          "Reminder: You have an outstanding balance with Vektiss", html,
          `Hi ${client.name ?? "there"}, you have an outstanding balance of $${client.balance_due}.`
        );
      }
    }

    // ── 5. TASKS DUE WITHIN 24 HOURS ──
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const today = now.toISOString().split("T")[0];

    const { data: dueSoonTasks } = await supabase
      .from("tasks").select("id, title, due_date, assigned_to")
      .gte("due_date", today).lte("due_date", in24h)
      .neq("status", "done");

    if (dueSoonTasks?.length) {
      for (const task of dueSoonTasks) {
        const targetUserId = task.assigned_to;
        if (!targetUserId) continue;
        if (!isEmailEnabled(targetUserId, "tasks")) continue;
        const refId = `deadline_${task.id}_${targetUserId}`;
        if (await wasRecentlySent("task_deadline", refId)) continue;

        const { data: { user } } = await supabase.auth.admin.getUserById(targetUserId);
        if (!user?.email) continue;

        const { data: roleData } = await supabase
          .from("user_roles").select("role").eq("user_id", targetUserId).single();
        const portalPath = roleData?.role === "admin" ? "/admin" : "/ops/tasks";

        const html = buildReminderHtml(
          "Task due soon",
          `The task "<strong>${task.title}</strong>" is due on <strong>${task.due_date}</strong>. Please make sure it's completed on time.`,
          "View Tasks", `${PORTAL_URL}${portalPath}`
        );
        await logAndEnqueue("task_deadline", refId, user.email, targetUserId,
          `Reminder: "${task.title}" is due ${task.due_date === today ? "today" : "tomorrow"}`, html,
          `The task "${task.title}" is due on ${task.due_date}.`
        );
      }
    }

    // ── 6. LEAD FOLLOW-UP REMINDERS ──
    const { data: leadsWithFollowups } = await supabase
      .from("clients")
      .select("id, name, email, phone, pipeline_stage, follow_up_start, follow_up_end, type, notes")
      .eq("status", "lead")
      .not("follow_up_start", "is", null)
      .not("follow_up_end", "is", null);

    if (leadsWithFollowups?.length) {
      const { data: adminRoles } = await supabase
        .from("user_roles").select("user_id").eq("role", "admin");
      const adminUserIds = adminRoles?.map((r) => r.user_id) ?? [];

      for (const lead of leadsWithFollowups) {
        const todayDate = new Date(today);
        const startDate = new Date(lead.follow_up_start!);
        const endDate = new Date(lead.follow_up_end!);

        // Send reminder when today is within follow-up window or overdue
        const isInWindow = todayDate >= startDate && todayDate <= endDate;
        const isOverdue = todayDate > endDate;

        if (!isInWindow && !isOverdue) continue;

        const urgency = isOverdue ? "overdue" : "due";
        const stageLabel = (lead.pipeline_stage ?? "new").replace(/_/g, " ");

        for (const adminId of adminUserIds) {
          const refId = `lead_followup_${lead.id}_${adminId}_${today}`;
          if (await wasRecentlySent("lead_followup", refId)) continue;

          const { data: { user } } = await supabase.auth.admin.getUserById(adminId);
          if (!user?.email) continue;

          const leadInfo = [
            lead.type ? `<strong>Type:</strong> ${lead.type}` : null,
            lead.email ? `<strong>Email:</strong> ${lead.email}` : null,
            lead.phone ? `<strong>Phone:</strong> ${lead.phone}` : null,
            `<strong>Stage:</strong> ${stageLabel}`,
            `<strong>Follow-up window:</strong> ${lead.follow_up_start} → ${lead.follow_up_end}`,
          ].filter(Boolean).join("<br/>");

          const html = buildReminderHtml(
            isOverdue ? `⚠️ Overdue follow-up: ${lead.name}` : `📞 Follow up with ${lead.name}`,
            `${isOverdue
              ? `The follow-up window for <strong>${lead.name}</strong> has passed. Don't lose this lead!`
              : `It's time to follow up with <strong>${lead.name}</strong> (${stageLabel} stage).`
            }<br/><br/>${leadInfo}`,
            "View Lead Pipeline", `${PORTAL_URL}/admin/clients`
          );
          await logAndEnqueue("lead_followup", refId, user.email, adminId,
            isOverdue
              ? `⚠️ Overdue: Follow up with ${lead.name}`
              : `Follow-up reminder: ${lead.name}`,
            html,
            `${isOverdue ? "Overdue" : "Time to"} follow up with ${lead.name} (${stageLabel}).`
          );
        }
      }
    }

    // ── 7. DAILY DIGEST for opted-in users ──
    const digestUsers = (allPrefs ?? []).filter(p => p.email_digest);
    for (const pref of digestUsers) {
      const digestRef = `digest_${pref.user_id}_${today}`;
      if (await wasRecentlySent("daily_digest", digestRef)) continue;

      const { data: { user } } = await supabase.auth.admin.getUserById(pref.user_id);
      if (!user?.email) continue;

      const { data: profile } = await supabase
        .from("profiles").select("display_name")
        .eq("user_id", pref.user_id).maybeSingle();

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", pref.user_id).single();
      const role = roleData?.role ?? "client";

      const sections: { icon: string; title: string; items: string[]; cta: string; url: string }[] = [];

      // Unread messages
      if (role === "client") {
        const { data: clientData } = await supabase
          .from("clients").select("id").eq("user_id", pref.user_id).maybeSingle();
        if (clientData) {
          const { data: unread } = await supabase
            .from("messages").select("content, created_at")
            .eq("client_id", clientData.id).is("read_at", null)
            .neq("sender_id", pref.user_id).order("created_at", { ascending: false }).limit(5);
          if (unread?.length) {
            sections.push({
              icon: "💬", title: `${unread.length} Unread Message${unread.length > 1 ? 's' : ''}`,
              items: unread.map(m => m.content.slice(0, 80) + (m.content.length > 80 ? '...' : '')),
              cta: "View Messages", url: `${PORTAL_URL}/portal/messages`,
            });
          }
        }
      }

      // Pending tasks (for ops/admin)
      if (role === "admin" || role === "ops") {
        const { data: myTasks } = await supabase
          .from("tasks").select("title, status, due_date")
          .eq("assigned_to", pref.user_id).neq("status", "done")
          .order("due_date", { ascending: true }).limit(5);
        if (myTasks?.length) {
          sections.push({
            icon: "📋", title: `${myTasks.length} Active Task${myTasks.length > 1 ? 's' : ''}`,
            items: myTasks.map(t => `${t.title}${t.due_date ? ` (due ${t.due_date})` : ''}`),
            cta: "View Tasks", url: `${PORTAL_URL}/${role === "admin" ? "admin" : "ops/tasks"}`,
          });
        }

        // Lead follow-ups due in digest
        const { data: digestLeads } = await supabase
          .from("clients")
          .select("name, pipeline_stage, follow_up_start, follow_up_end")
          .eq("status", "lead")
          .not("follow_up_start", "is", null)
          .not("follow_up_end", "is", null);

        const dueLeads = (digestLeads ?? []).filter(l => {
          const s = new Date(l.follow_up_start!);
          const e = new Date(l.follow_up_end!);
          const t = new Date(today);
          return t >= s; // in window or overdue
        });

        if (dueLeads.length > 0) {
          sections.push({
            icon: "📞", title: `${dueLeads.length} Lead Follow-up${dueLeads.length > 1 ? 's' : ''} Due`,
            items: dueLeads.map(l => {
              const overdue = new Date(today) > new Date(l.follow_up_end!);
              return `${overdue ? '⚠️ ' : ''}${l.name} (${(l.pipeline_stage ?? 'new').replace(/_/g, ' ')})`;
            }),
            cta: "View Pipeline", url: `${PORTAL_URL}/admin/clients`,
          });
        }
      }

      // Pending approvals (for client)
      if (role === "client") {
        const { data: clientData } = await supabase
          .from("clients").select("id").eq("user_id", pref.user_id).maybeSingle();
        if (clientData) {
          const { data: approvals } = await supabase
            .from("approval_requests").select("title")
            .eq("client_id", clientData.id).eq("status", "pending").limit(5);
          if (approvals?.length) {
            sections.push({
              icon: "✅", title: `${approvals.length} Pending Approval${approvals.length > 1 ? 's' : ''}`,
              items: approvals.map(a => a.title),
              cta: "Review Approvals", url: `${PORTAL_URL}/portal/projects`,
            });
          }
        }
      }

      if (sections.length === 0) continue;

      const digestHtml = buildDigestHtml(profile?.display_name ?? '', sections);
      await logAndEnqueue("daily_digest", digestRef, user.email, pref.user_id,
        "Your daily Vektiss summary", digestHtml,
        `Good morning! Here's your daily summary from Vektiss.`
      );
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
