import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── Gather all data ──
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    const [
      { data: clients },
      { data: projects },
      { data: tasks },
      { data: payments },
      { data: messages },
      { data: timeEntries },
      { data: approvals },
    ] = await Promise.all([
      supabase.from("clients").select("*"),
      supabase.from("projects").select("*, clients(name)"),
      supabase.from("tasks").select("*, clients(name)").is("archived_at", null),
      supabase.from("client_payments").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("messages").select("client_id, created_at, sender_id").order("created_at", { ascending: false }).limit(200),
      supabase.from("time_entries").select("*").gte("entry_date", new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0]),
      supabase.from("approval_requests").select("*").eq("status", "pending"),
    ]);

    // ── Build analysis context ──
    const activeClients = (clients ?? []).filter(c => c.status === "active");
    const overdueTasks = (tasks ?? []).filter(t => t.due_date && new Date(t.due_date) < now && t.status !== "done");
    const activeProjects = (projects ?? []).filter(p => p.status === "in_progress");
    const mrr = activeClients.reduce((s, c) => s + (c.monthly_fee ?? 0), 0);

    // Communication gaps: clients not contacted in 14+ days
    const clientLastContact: Record<string, Date> = {};
    for (const msg of (messages ?? [])) {
      const cid = msg.client_id;
      const date = new Date(msg.created_at);
      if (!clientLastContact[cid] || date > clientLastContact[cid]) {
        clientLastContact[cid] = date;
      }
    }
    const commGaps = activeClients.filter(c => {
      const last = clientLastContact[c.id] || (c.last_contact_date ? new Date(c.last_contact_date) : null);
      if (!last) return true;
      return (now.getTime() - last.getTime()) > 14 * 86400000;
    });

    // Outstanding balances
    const unpaidClients = activeClients.filter(c => (c.balance_due ?? 0) > 0);

    // Hours this week
    const weekHours = (timeEntries ?? []).reduce((s, e) => s + (e.hours ?? 0), 0);

    const contextSummary = `
TODAY: ${todayStr}
ACTIVE CLIENTS: ${activeClients.length} | MRR: $${mrr}
ACTIVE PROJECTS: ${activeProjects.length}
OVERDUE TASKS: ${overdueTasks.length}
PENDING APPROVALS: ${(approvals ?? []).length}
COMMUNICATION GAPS (14+ days): ${commGaps.length} clients: ${commGaps.map(c => c.name).join(", ") || "none"}
UNPAID BALANCES: ${unpaidClients.length} clients totaling $${unpaidClients.reduce((s, c) => s + (c.balance_due ?? 0), 0)}
HOURS LOGGED THIS WEEK: ${weekHours.toFixed(1)}

OVERDUE TASKS:
${overdueTasks.slice(0, 15).map(t => `- "${t.title}" (due ${t.due_date}) [${t.priority}] for ${(t.clients as any)?.name ?? "internal"}`).join("\n") || "None"}

ACTIVE PROJECTS:
${activeProjects.map(p => `- ${p.name} (${(p.clients as any)?.name}) — ${p.current_phase} phase, ${p.progress}% done`).join("\n") || "None"}

PENDING APPROVALS:
${(approvals ?? []).map(a => `- "${a.title}" awaiting client response since ${a.created_at.split("T")[0]}`).join("\n") || "None"}
`;

    // ── Call OpenAI for analysis ──
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are Vektiss AI, an autonomous agency operations engine. Analyze the data and return a JSON object with these exact keys:

{
  "briefing": "A 3-5 sentence executive summary of today's priorities and agency health",
  "insights": [
    {"title": "short title", "body": "1-2 sentence insight", "type": "risk|opportunity|achievement|trend", "priority": "high|medium|low"}
  ],
  "alerts": [
    {"title": "alert title", "body": "what needs attention and why", "severity": "urgent|warning|info"}
  ],
  "auto_tasks": [
    {"title": "task title", "description": "what to do", "priority": "high|medium|low", "client_name": "client name or null for internal"}
  ]
}

RULES:
- Generate 3-6 insights based on actual data patterns
- Generate alerts for anything urgent (overdue tasks, unpaid balances, communication gaps)
- Suggest 2-4 auto-tasks that should be created (follow-ups, check-ins, reviews)
- Be specific with names and numbers, not generic
- For auto_tasks, only suggest things that don't already exist as tasks
- Focus on actionable intelligence, not fluff
- Return ONLY valid JSON, no markdown wrapping`
          },
          { role: "user", content: contextSummary }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("OpenAI error:", aiResponse.status, errText);
      throw new Error(`OpenAI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    let rawContent = aiData.choices?.[0]?.message?.content ?? "{}";
    
    // Strip markdown code fences if present
    rawContent = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    
    const analysis = JSON.parse(rawContent);

    // ── Execute autonomous actions ──
    const results = { notifications: 0, tasks: 0, briefing: false };

    // 1. Create proactive alert notifications for all admins
    const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = (adminRoles ?? []).map(r => r.user_id);

    for (const alert of (analysis.alerts ?? [])) {
      for (const adminId of adminIds) {
        await supabase.from("notifications").insert({
          user_id: adminId,
          title: `🤖 ${alert.title}`,
          body: alert.body,
          type: alert.severity === "urgent" ? "payment" : "info",
          link: "/admin/dashboard",
        });
        results.notifications++;
      }
    }

    // 2. Auto-create suggested tasks
    for (const task of (analysis.auto_tasks ?? [])) {
      // Find client_id if client_name provided
      let clientId: string | null = null;
      if (task.client_name) {
        const match = (clients ?? []).find(c => 
          c.name.toLowerCase().includes(task.client_name.toLowerCase())
        );
        if (match) clientId = match.id;
      }

      const priorityMap: Record<string, string> = { high: "high", medium: "medium", low: "low" };
      await supabase.from("tasks").insert({
        title: task.title,
        description: `[AI Generated] ${task.description}`,
        priority: priorityMap[task.priority] ?? "medium",
        status: "todo",
        client_id: clientId,
      });
      results.tasks++;
    }

    // 3. Store daily briefing as company summary
    await supabase.from("company_summaries").insert({
      title: `AI Daily Briefing — ${todayStr}`,
      content: `## Executive Summary\n${analysis.briefing}\n\n## Key Insights\n${(analysis.insights ?? []).map((i: any) => `### ${i.type === "risk" ? "⚠️" : i.type === "opportunity" ? "💡" : i.type === "achievement" ? "✅" : "📈"} ${i.title}\n${i.body}`).join("\n\n")}\n\n## Alerts\n${(analysis.alerts ?? []).map((a: any) => `- **${a.title}**: ${a.body}`).join("\n")}\n\n## Auto-Created Tasks\n${(analysis.auto_tasks ?? []).map((t: any) => `- ${t.title} (${t.priority})`).join("\n")}`,
      created_by: adminIds[0] ?? "00000000-0000-0000-0000-000000000000",
      summary_date: todayStr,
    });
    results.briefing = true;

    // 4. Store the latest insights in a format the dashboard can query
    // We'll use the existing company_summaries but also store structured data
    // The dashboard widget will call a separate endpoint to get real-time insights

    return new Response(JSON.stringify({
      success: true,
      results,
      analysis,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("AI Daily Engine error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
