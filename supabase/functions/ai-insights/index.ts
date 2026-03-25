import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Real-time AI Insights endpoint — called by the dashboard widget
 * to show live AI-generated insight cards.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: roleData } = await supabase.rpc("get_user_role", { _user_id: user.id });
        if (roleData !== "admin") {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Quick data fetch
    const [
      { data: clients },
      { data: projects },
      { data: tasks },
      { data: payments },
      { data: timeEntries },
    ] = await Promise.all([
      supabase.from("clients").select("id, name, status, monthly_fee, balance_due, last_contact_date"),
      supabase.from("projects").select("id, name, status, progress, current_phase, client_id, clients(name)"),
      supabase.from("tasks").select("id, title, status, priority, due_date, client_id, clients(name)").is("archived_at", null),
      supabase.from("client_payments").select("amount, payment_month, payment_year, client_id")
        .eq("payment_year", currentYear),
      supabase.from("time_entries").select("hours, category, entry_date")
        .gte("entry_date", new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0]),
    ]);

    const activeClients = (clients ?? []).filter(c => c.status === "active");
    const mrr = activeClients.reduce((s, c) => s + (c.monthly_fee ?? 0), 0);
    const overdueTasks = (tasks ?? []).filter(t => t.due_date && new Date(t.due_date) < now && t.status !== "done");
    const activeProjects = (projects ?? []).filter(p => p.status === "in_progress");
    const monthHours = (timeEntries ?? []).reduce((s, e) => s + (e.hours ?? 0), 0);

    // Month revenue
    const monthRevenue = (payments ?? [])
      .filter(p => p.payment_month === currentMonth)
      .reduce((s, p) => s + Number(p.amount), 0);
    const lastMonthRevenue = (payments ?? [])
      .filter(p => p.payment_month === (currentMonth === 1 ? 12 : currentMonth - 1))
      .reduce((s, p) => s + Number(p.amount), 0);

    const contextForAI = `
DATA SNAPSHOT (${now.toLocaleDateString()}):
- Active clients: ${activeClients.length}, MRR: $${mrr}
- This month revenue: $${monthRevenue}, Last month: $${lastMonthRevenue}
- Active projects: ${activeProjects.length}, avg progress: ${activeProjects.length > 0 ? Math.round(activeProjects.reduce((s, p) => s + p.progress, 0) / activeProjects.length) : 0}%
- Overdue tasks: ${overdueTasks.length}
- Hours logged (30 days): ${monthHours.toFixed(1)}
- Tasks by status: todo=${(tasks ?? []).filter(t => t.status === "todo").length}, in_progress=${(tasks ?? []).filter(t => t.status === "in_progress").length}, review=${(tasks ?? []).filter(t => t.status === "review").length}, done=${(tasks ?? []).filter(t => t.status === "done").length}
- Clients needing attention: ${activeClients.filter(c => (c.balance_due ?? 0) > 0).map(c => `${c.name} ($${c.balance_due} owed)`).join(", ") || "none"}
- Top overdue: ${overdueTasks.slice(0, 5).map(t => `"${t.title}" (${t.due_date})`).join(", ") || "none"}
`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are the Vektiss AI engine. Generate exactly 4 dashboard insight cards. Return a JSON array:
[
  {"title": "short 3-5 word title", "body": "1 concise sentence with specific numbers", "type": "revenue|risk|progress|productivity", "trend": "up|down|neutral", "metric": "optional key number to highlight"}
]

Types: revenue = financial insight, risk = something needing attention, progress = project/delivery update, productivity = work output analysis.
Be specific with real numbers. No generic advice. Focus on what's most important RIGHT NOW. Return ONLY valid JSON array.`
          },
          { role: "user", content: contextForAI }
        ],
        temperature: 0.2,
      }),
    });

    if (!aiRes.ok) throw new Error(`OpenAI error: ${aiRes.status}`);
    const aiData = await aiRes.json();
    let content = aiData.choices?.[0]?.message?.content ?? "[]";
    content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const insights = JSON.parse(content);

    return new Response(JSON.stringify({ insights }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("AI Insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
