import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart3, Users, DollarSign, TrendingUp, Download, Activity, Heart, AlertTriangle, FolderKanban, FileSpreadsheet,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, Legend,
} from "recharts";
import { motion } from "framer-motion";
import { toast } from "sonner";

function fmt(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(val);
}

const HEALTH_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  healthy: { bg: "bg-emerald-500/20", text: "text-emerald-400", label: "Healthy" },
  attention: { bg: "bg-warning/20", text: "text-warning", label: "Needs Attention" },
  critical: { bg: "bg-destructive/20", text: "text-destructive", label: "Critical" },
};

const PIE_COLORS = [
  "hsl(213, 100%, 58%)", "hsl(142, 71%, 45%)", "hsl(48, 96%, 53%)",
  "hsl(0, 84%, 60%)", "hsl(262, 80%, 50%)", "hsl(200, 80%, 50%)",
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const PHASE_LABELS: Record<string, string> = {
  discovery: "Discovery", design: "Design", development: "Development",
  review: "Review", launch: "Launch", deploy: "Deploy",
};
const PHASE_COLORS: Record<string, string> = {
  discovery: "hsl(213, 100%, 58%)", design: "hsl(262, 80%, 50%)", development: "hsl(142, 71%, 45%)",
  review: "hsl(48, 96%, 53%)", launch: "hsl(0, 84%, 60%)", deploy: "hsl(200, 80%, 50%)",
};
const STATUS_COLORS: Record<string, string> = {
  not_started: "hsl(var(--muted-foreground))", in_progress: "hsl(213, 100%, 58%)",
  completed: "hsl(142, 71%, 45%)", on_hold: "hsl(48, 96%, 53%)",
};

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  color: "hsl(var(--foreground))",
  fontSize: "12px",
  boxShadow: "0 4px 12px hsl(var(--foreground) / 0.1)",
};

export default function AdminReports() {
  const { data: clients } = useQuery({
    queryKey: ["report-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["report-payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_payments").select("*, clients(name)");
      if (error) throw error;
      return data;
    },
  });

  const { data: projects } = useQuery({
    queryKey: ["report-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*, clients(name)");
      if (error) throw error;
      return data;
    },
  });

  const { data: expenses } = useQuery({
    queryKey: ["report-expenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: tasks } = useQuery({
    queryKey: ["report-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*");
      if (error) throw error;
      return data;
    },
  });

  const activeClients = (clients ?? []).filter((c) => c.status === "active");
  const actualPayments = (payments ?? []).filter((p) => p.notes !== "Projected");
  const totalRevenue = actualPayments.reduce((s, p) => s + Number(p.amount), 0);
  const totalExpenses = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const mrr = activeClients.reduce((s, c) => s + (c.monthly_fee ?? 0), 0);
  const avgRevenuePerClient = activeClients.length > 0 ? mrr / activeClients.length : 0;

  const completedTasks = (tasks ?? []).filter((t) => t.status === "done").length;
  const totalTasks = (tasks ?? []).length;
  const taskCompletionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  const completedProjects = (projects ?? []).filter((p) => p.status === "completed").length;
  const activeProjects = (projects ?? []).filter((p) => p.status === "in_progress").length;

  // --- Revenue trend (last 12 months) ---
  const now = new Date();
  const revenueTrend = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const rev = actualPayments
      .filter((p) => p.payment_month === month && p.payment_year === year)
      .reduce((s, p) => s + Number(p.amount), 0);
    const exp = (expenses ?? [])
      .filter((e) => e.expense_month === month && e.expense_year === year)
      .reduce((s, e) => s + Number(e.amount), 0);
    return { label: `${MONTHS[month - 1]} ${String(year).slice(2)}`, revenue: rev, expenses: exp, profit: rev - exp };
  });

  // --- Project pipeline ---
  const phaseDist = Object.keys(PHASE_LABELS).map((phase) => ({
    name: PHASE_LABELS[phase],
    value: (projects ?? []).filter((p) => p.current_phase === phase && p.status === "in_progress").length,
    fill: PHASE_COLORS[phase],
  })).filter((d) => d.value > 0);

  const statusDist = ["not_started", "in_progress", "completed", "on_hold"].map((s) => ({
    name: s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    value: (projects ?? []).filter((p) => p.status === s).length,
    fill: STATUS_COLORS[s],
  })).filter((d) => d.value > 0);

  // --- Client health ---
  const clientHealth = activeClients.map((client) => {
    const clientPayments = actualPayments.filter((p) => p.client_id === client.id);
    const clientProjects = (projects ?? []).filter((p) => p.client_id === client.id);
    const activeProjectCount = clientProjects.filter((p) => p.status === "in_progress").length;
    const totalPaid = clientPayments.reduce((s, p) => s + Number(p.amount), 0);
    const avgProgress = clientProjects.length > 0
      ? clientProjects.reduce((s, p) => s + p.progress, 0) / clientProjects.length : 0;

    let health: "healthy" | "attention" | "critical" = "healthy";
    if (clientPayments.length === 0 && activeProjectCount > 0) health = "critical";
    else if (activeProjectCount === 0 && client.status === "active") health = "attention";

    return { ...client, totalPaid, activeProjectCount, avgProgress, health, projectCount: clientProjects.length };
  }).sort((a, b) => {
    const order = { critical: 0, attention: 1, healthy: 2 };
    return order[a.health] - order[b.health];
  });

  // Revenue by client for pie chart
  const revenueByClient = activeClients.map((c) => {
    const rev = actualPayments.filter((p) => p.client_id === c.id).reduce((s, p) => s + Number(p.amount), 0);
    return { name: c.name, value: rev };
  }).filter((c) => c.value > 0).sort((a, b) => b.value - a.value);

  // Client status distribution
  const clientStatusDist = ["active", "onboarding", "prospect", "lead", "closed"].map((s) => ({
    name: s.charAt(0).toUpperCase() + s.slice(1),
    value: (clients ?? []).filter((c) => c.status === s).length,
  })).filter((s) => s.value > 0);

  // --- Excel export ---
  const exportExcel = async () => {
    try {
      toast.info("Generating report...");

      // Build CSV with multiple sections separated by blank lines
      const sections: string[][] = [];

      // KPIs
      sections.push(
        ["BUSINESS KPIs"],
        ["Metric", "Value"],
        ["Total Revenue", fmt(totalRevenue)],
        ["Total Expenses", fmt(totalExpenses)],
        ["Net Profit", fmt(netProfit)],
        ["Profit Margin", `${profitMargin.toFixed(1)}%`],
        ["MRR", fmt(mrr)],
        ["Avg Revenue/Client", fmt(avgRevenuePerClient)],
        ["Active Clients", String(activeClients.length)],
        ["Active Projects", String(activeProjects)],
        ["Completed Projects", String(completedProjects)],
        ["Task Completion Rate", `${taskCompletionRate.toFixed(1)}%`],
        [],
      );

      // Revenue trend
      sections.push(
        ["MONTHLY REVENUE TREND (Last 12 Months)"],
        ["Month", "Revenue", "Expenses", "Profit"],
        ...revenueTrend.map((r) => [r.label, fmt(r.revenue), fmt(r.expenses), fmt(r.profit)]),
        [],
      );

      // Client health
      sections.push(
        ["CLIENT HEALTH SCORES"],
        ["Client", "Status", "Health", "Projects", "Avg Progress", "Total Paid"],
        ...clientHealth.map((c) => [
          c.name, c.status, HEALTH_COLORS[c.health].label,
          String(c.projectCount), `${c.avgProgress.toFixed(0)}%`, fmt(c.totalPaid),
        ]),
        [],
      );

      // Project pipeline
      sections.push(
        ["PROJECT PIPELINE"],
        ["Project", "Client", "Status", "Phase", "Progress"],
        ...(projects ?? []).map((p) => [
          p.name,
          (p.clients as { name: string } | null)?.name ?? "",
          p.status.replace(/_/g, " "),
          PHASE_LABELS[p.current_phase] ?? p.current_phase,
          `${p.progress}%`,
        ]),
      );

      const csv = sections.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vektiss-business-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded!");
    } catch {
      toast.error("Failed to generate report");
    }
  };

  const kpis = [
    { label: "Net Profit", value: fmt(netProfit), icon: DollarSign, color: netProfit >= 0 ? "text-emerald-400" : "text-destructive" },
    { label: "Profit Margin", value: `${profitMargin.toFixed(1)}%`, icon: TrendingUp, color: profitMargin >= 20 ? "text-emerald-400" : "text-warning" },
    { label: "MRR", value: fmt(mrr), icon: DollarSign, color: "text-primary" },
    { label: "Avg Revenue/Client", value: fmt(avgRevenuePerClient), icon: Users, color: "text-primary" },
    { label: "Task Completion", value: `${taskCompletionRate.toFixed(0)}%`, icon: Activity, color: taskCompletionRate >= 70 ? "text-emerald-400" : "text-warning" },
  ];

  const anim = (delay: number) => ({
    initial: { opacity: 0, y: 20 } as const,
    animate: { opacity: 1, y: 0 } as const,
    transition: { duration: 0.4, delay },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div {...anim(0)} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports & Analytics</h1>
          <p className="text-muted-foreground">KPIs, trends, pipeline, and business intelligence.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Export Full Report
          </Button>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((kpi, i) => (
          <motion.div key={kpi.label} {...anim(0.1 + i * 0.06)}>
            <Card className="hover:border-primary/20 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold font-mono ${kpi.color}`}>{kpi.value}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Revenue Trend Area Chart */}
      <motion.div {...anim(0.4)}>
        <Card className="hover:border-primary/20 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" /> Revenue Trend (Last 12 Months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueTrend}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(213, 100%, 58%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(213, 100%, 58%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [fmt(v), name]} />
                  <Legend />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(142, 71%, 45%)" fill="url(#revenueGrad)" strokeWidth={2} dot={{ r: 3, fill: "hsl(142, 71%, 45%)" }} activeDot={{ r: 5 }} />
                  <Area type="monotone" dataKey="expenses" name="Expenses" stroke="hsl(0, 84%, 60%)" fill="url(#expenseGrad)" strokeWidth={2} dot={{ r: 3, fill: "hsl(0, 84%, 60%)" }} activeDot={{ r: 5 }} />
                  <Area type="monotone" dataKey="profit" name="Profit" stroke="hsl(213, 100%, 58%)" fill="url(#profitGrad)" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: "hsl(213, 100%, 58%)" }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Project Pipeline + Revenue by Client */}
      <motion.div {...anim(0.5)} className="grid gap-4 lg:grid-cols-2">
        {/* Project Pipeline */}
        <Card className="hover:border-primary/20 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-primary" /> Project Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* By Phase */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-3">Active Projects by Phase</p>
              {phaseDist.length > 0 ? (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={phaseDist} layout="vertical" barSize={20}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={90} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted) / 0.3)" }} />
                      <Bar dataKey="value" name="Projects" radius={[0, 6, 6, 0]}>
                        {phaseDist.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No active projects</p>
              )}
            </div>

            {/* By Status */}
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-3">All Projects by Status</p>
              <div className="space-y-3">
                {statusDist.map((s) => (
                  <div key={s.name} className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: s.fill }} />
                    <span className="text-sm font-medium flex-1">{s.name}</span>
                    <Progress value={(s.value / Math.max((projects ?? []).length, 1)) * 100} className="h-2 w-28" />
                    <span className="text-sm font-mono font-semibold w-6 text-right">{s.value}</span>
                  </div>
                ))}
              </div>
              <div className="pt-4 grid grid-cols-3 gap-4 text-center border-t border-border mt-4">
                <div>
                  <p className="text-2xl font-bold font-mono text-primary">{activeProjects}</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
                <div>
                  <p className="text-2xl font-bold font-mono text-emerald-400">{completedProjects}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
                <div>
                  <p className="text-2xl font-bold font-mono">{(projects ?? []).length}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Revenue by Client + Client Distribution */}
        <Card className="hover:border-primary/20 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> Revenue by Client
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revenueByClient.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <defs>
                      {PIE_COLORS.map((color, i) => (
                        <linearGradient key={i} id={`pieGrad${i}`} x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity={1} />
                          <stop offset="100%" stopColor={color} stopOpacity={0.7} />
                        </linearGradient>
                      ))}
                    </defs>
                    <Pie data={revenueByClient} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" strokeWidth={0}>
                      {revenueByClient.map((_, i) => (
                        <Cell key={i} fill={`url(#pieGrad${i % PIE_COLORS.length})`} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => fmt(v)}
                      contentStyle={tooltipStyle}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">No revenue data yet</p>
            )}
            <div className="flex flex-wrap gap-3 mt-4 justify-center">
              {revenueByClient.map((c, i) => (
                <div key={c.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-muted-foreground">{c.name}</span>
                  <span className="font-mono font-semibold">{fmt(c.value)}</span>
                </div>
              ))}
            </div>

            {/* Client Distribution */}
            <div className="border-t border-border mt-6 pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" /> Client Distribution
              </p>
              <div className="space-y-3">
                {clientStatusDist.map((s) => (
                  <div key={s.name} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{s.name}</span>
                    <div className="flex items-center gap-3">
                      <Progress value={(s.value / (clients?.length || 1)) * 100} className="h-2 w-32" />
                      <span className="text-sm font-mono font-semibold w-6 text-right">{s.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Client Health Table */}
      <motion.div {...anim(0.6)}>
        <Card className="hover:border-primary/20 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Heart className="h-5 w-5 text-primary" /> Client Health Scores
            </CardTitle>
          </CardHeader>
          <CardContent>
            {clientHealth.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead className="text-center">Projects</TableHead>
                    <TableHead>Avg Progress</TableHead>
                    <TableHead className="text-right">Total Paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientHealth.map((c) => {
                    const h = HEALTH_COLORS[c.health];
                    return (
                      <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{c.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${h.bg} ${h.text} border-transparent text-xs gap-1`}>
                            {c.health === "critical" && <AlertTriangle className="h-3 w-3" />}
                            {h.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-mono">{c.projectCount}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={c.avgProgress} className="h-1.5 w-20" />
                            <span className="text-xs font-mono text-muted-foreground">{c.avgProgress.toFixed(0)}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmt(c.totalPaid)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No active clients to score</p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
