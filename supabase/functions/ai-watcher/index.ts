import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type DecisionDraft = {
  type: string;
  title: string;
  body?: string;
  recommendation?: string;
  context: Record<string, unknown>;
  risk_tier: "low" | "medium" | "high";
  client_id?: string | null;
  project_id?: string | null;
  link?: string;
  dedupe_key: string; // unique fingerprint to avoid duplicates
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const drafts: DecisionDraft[] = [];

    // ── 1. Margin breaches: clients losing money or below threshold this month ──
    const { data: settings } = await supabase
      .from("business_settings")
      .select("low_margin_threshold_pct, internal_hourly_cost")
      .limit(1)
      .maybeSingle();
    const lowMarginThreshold = Number(settings?.low_margin_threshold_pct ?? 20);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];

    const { data: profitability } = await supabase
      .from("v_client_profitability")
      .select("*")
      .eq("month_start", monthStart);

    for (const row of profitability ?? []) {
      if (Number(row.revenue) <= 0 && Number(row.hours) <= 0) continue;
      const margin = row.margin_pct === null ? null : Number(row.margin_pct);
      const profit = Number(row.profit);
      const isLosing = profit < 0;
      const isLowMargin =
        margin !== null && margin < lowMarginThreshold && profit >= 0;
      if (!isLosing && !isLowMargin) continue;

      drafts.push({
        type: isLosing ? "margin_breach" : "low_margin",
        title: isLosing
          ? `${row.client_name}: losing $${Math.abs(profit).toFixed(0)} this month`
          : `${row.client_name}: thin margin (${margin?.toFixed(0)}%)`,
        body: `Revenue $${Number(row.revenue).toFixed(0)} • Labor $${Number(
          row.labor_cost,
        ).toFixed(0)} (${Number(row.hours).toFixed(1)}h) • External $${Number(
          row.external_cost,
        ).toFixed(0)} → Profit $${profit.toFixed(0)}`,
        recommendation: isLosing
          ? "Consider raising the rate, capping hours, renegotiating scope, or offboarding."
          : `Margin is below your ${lowMarginThreshold}% threshold. Review scope or pricing soon.`,
        context: {
          client_id: row.client_id,
          revenue: row.revenue,
          hours: row.hours,
          labor_cost: row.labor_cost,
          external_cost: row.external_cost,
          profit,
          margin_pct: margin,
          month_start: monthStart,
        },
        risk_tier: isLosing ? "high" : "medium",
        client_id: row.client_id,
        link: `/admin/clients/${row.client_id}`,
        dedupe_key: `${isLosing ? "margin_breach" : "low_margin"}:${row.client_id}:${monthStart}`,
      });
    }

    // ── 2. Communication gaps: active clients not messaged in 14+ days ──
    const { data: activeClients } = await supabase
      .from("clients")
      .select("id, name, last_contact_date")
      .eq("status", "active");
    const cutoff14 = new Date(now.getTime() - 14 * 86400000);

    const { data: recentMsgs } = await supabase
      .from("messages")
      .select("client_id, created_at")
      .gte("created_at", cutoff14.toISOString());
    const recentClientIds = new Set((recentMsgs ?? []).map((m: any) => m.client_id));

    for (const c of activeClients ?? []) {
      if (recentClientIds.has(c.id)) continue;
      const lastContact = c.last_contact_date ? new Date(c.last_contact_date) : null;
      if (lastContact && lastContact > cutoff14) continue;
      const daysSilent = lastContact
        ? Math.floor((now.getTime() - lastContact.getTime()) / 86400000)
        : 30;
      drafts.push({
        type: "communication_gap",
        title: `${c.name}: silent for ${daysSilent}+ days`,
        body: lastContact
          ? `Last contact ${lastContact.toISOString().split("T")[0]}. Active client with no recent touchpoints.`
          : `No recorded contact. Active client with no recent touchpoints.`,
        recommendation: "Send a quick check-in message or schedule a sync call.",
        context: { client_id: c.id, days_silent: daysSilent },
        risk_tier: "medium",
        client_id: c.id,
        link: `/admin/messages?client=${c.id}`,
        dedupe_key: `communication_gap:${c.id}:${monthStart}`,
      });
    }

    // ── 3. Stale viewed proposals: viewed 3+ times but not signed ──
    const cutoff7 = new Date(now.getTime() - 7 * 86400000);
    const { data: staleProposals } = await supabase
      .from("proposals")
      .select("id, view_count, status, last_viewed_at, signed_at, client_id, leads(name, company), clients(name)")
      .gte("view_count", 3)
      .neq("status", "signed")
      .neq("status", "paid")
      .is("signed_at", null);

    for (const p of staleProposals ?? []) {
      const lastView = p.last_viewed_at ? new Date(p.last_viewed_at) : null;
      if (!lastView || lastView < cutoff7) continue; // only flag if recently active
      const name =
        (p.clients as any)?.name ?? (p.leads as any)?.company ?? (p.leads as any)?.name ?? "Unknown";
      drafts.push({
        type: "proposal_warm_lead",
        title: `${name}: proposal opened ${p.view_count}× but not signed`,
        body: `Last opened ${lastView.toISOString().split("T")[0]}. They're interested — follow up while it's hot.`,
        recommendation: "Send a personal nudge or offer a 15-min call to answer questions.",
        context: { proposal_id: p.id, view_count: p.view_count, status: p.status },
        risk_tier: "low",
        client_id: p.client_id,
        link: `/admin/proposals`,
        dedupe_key: `proposal_warm:${p.id}:${lastView.toISOString().split("T")[0]}`,
      });
    }

    // ── 4. Critical overdue tasks: high/urgent tasks past due ──
    const { data: overdue } = await supabase
      .from("tasks")
      .select("id, title, due_date, priority, client_id, clients(name)")
      .in("priority", ["high", "urgent"])
      .lt("due_date", now.toISOString().split("T")[0])
      .neq("status", "done")
      .is("archived_at", null);

    for (const t of overdue ?? []) {
      const daysOverdue = Math.floor(
        (now.getTime() - new Date(t.due_date).getTime()) / 86400000,
      );
      if (daysOverdue < 1) continue;
      drafts.push({
        type: "overdue_critical_task",
        title: `Overdue: "${t.title}"`,
        body: `${t.priority.toUpperCase()} priority, ${daysOverdue}d past due${
          (t.clients as any)?.name ? ` (${(t.clients as any).name})` : ""
        }.`,
        recommendation: "Reassign, push the date with a note, or close it out today.",
        context: { task_id: t.id, days_overdue: daysOverdue, priority: t.priority },
        risk_tier: "medium",
        client_id: t.client_id,
        link: `/admin/dashboard`,
        dedupe_key: `overdue_task:${t.id}`,
      });
    }

    // ── Insert decisions, skipping duplicates by recent dedupe_key in context ──
    const { data: existing } = await supabase
      .from("ai_decision_queue")
      .select("context")
      .eq("status", "pending")
      .gte("created_at", new Date(now.getTime() - 14 * 86400000).toISOString());
    const existingKeys = new Set(
      (existing ?? [])
        .map((r: any) => r?.context?._dedupe_key)
        .filter(Boolean),
    );

    // ── Honor learning preferences: skip drafts the admin previously rejected ──
    const { data: prefs } = await supabase
      .from("ai_preferences")
      .select("scope, scope_id, category")
      .eq("active", true);
    const blockedClientCategory = new Set(
      (prefs ?? [])
        .filter((p: any) => p.scope === "client" && p.scope_id && p.category)
        .map((p: any) => `${p.scope_id}::${p.category}`),
    );
    const blockedCategories = new Set(
      (prefs ?? [])
        .filter((p: any) => p.scope === "category" && p.category && !p.scope_id)
        .map((p: any) => p.category),
    );
    const skippedByLearning: string[] = [];

    let inserted = 0;
    const newDecisions: DecisionDraft[] = [];
    for (const d of drafts) {
      if (existingKeys.has(d.dedupe_key)) continue;
      if (d.client_id && blockedClientCategory.has(`${d.client_id}::${d.type}`)) {
        skippedByLearning.push(d.dedupe_key);
        continue;
      }
      if (blockedCategories.has(d.type)) {
        skippedByLearning.push(d.dedupe_key);
        continue;
      }
      newDecisions.push(d);
    }

    // Increment hit_count on preferences that blocked drafts (so admins can see what's working)
    if (skippedByLearning.length > 0 && (prefs?.length ?? 0) > 0) {
      // Best-effort: bump last_applied_at on all active preferences (cheap)
      await supabase
        .from("ai_preferences")
        .update({ last_applied_at: new Date().toISOString() })
        .eq("active", true)
        .in("category", drafts.map((d) => d.type));
    }

    if (newDecisions.length > 0) {
      const rows = newDecisions.map((d) => ({
        type: d.type,
        title: d.title,
        body: d.body ?? null,
        recommendation: d.recommendation ?? null,
        context: { ...d.context, _dedupe_key: d.dedupe_key },
        risk_tier: d.risk_tier,
        client_id: d.client_id ?? null,
        link: d.link ?? null,
      }));
      const { error } = await supabase.from("ai_decision_queue").insert(rows);
      if (error) throw error;
      inserted = rows.length;

      // Notify admins
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const adminIds = (admins ?? []).map((r: any) => r.user_id);

      const highRiskCount = newDecisions.filter((d) => d.risk_tier === "high").length;
      if (adminIds.length > 0 && newDecisions.length > 0) {
        const notifs = adminIds.map((uid) => ({
          user_id: uid,
          title: `🤖 ${newDecisions.length} new AI decision${newDecisions.length === 1 ? "" : "s"}${
            highRiskCount > 0 ? ` (${highRiskCount} high-risk)` : ""
          }`,
          body: newDecisions
            .slice(0, 3)
            .map((d) => `• ${d.title}`)
            .join("\n"),
          type: highRiskCount > 0 ? "payment" : "info",
          link: "/admin/brain",
        }));
        await supabase.from("notifications").insert(notifs);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        drafts_evaluated: drafts.length,
        decisions_inserted: inserted,
        skipped_by_learning: skippedByLearning.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ai-watcher error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});