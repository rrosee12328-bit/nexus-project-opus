import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart3, Users, DollarSign, TrendingUp, Activity, Heart, AlertTriangle,
  FolderKanban, FileSpreadsheet, Clock, CheckCircle2, AlertCircle, Target, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, Legend, RadialBarChart, RadialBar, ComposedChart, Line,
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
  "hsl(330, 70%, 50%)", "hsl(170, 70%, 45%)",
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

const CATEGORY_LABELS: Record<string, string> = {
  client_work: "Client Work", sales: "Sales", admin: "Admin", vektiss: "Vektiss",
  break: "Break", meeting: "Meeting", other: "Other",
};
const CATEGORY_COLORS: Record<string, string> = {
  client_work: "hsl(213, 100%, 58%)", sales: "hsl(142, 71%, 45%)", admin: "hsl(262, 80%, 50%)",
  vektiss: "hsl(48, 96%, 53%)", break: "hsl(var(--muted-foreground))", meeting: "hsl(200, 80%, 50%)",
  other: "hsl(0, 84%, 60%)",
};

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  color: "hsl(var(--foreground))",
  fontSize: "12px",
  boxShadow: "0 4px 12px hsl(var(--foreground) / 0.1)",
};

const YEAR_OPTIONS = [2024, 2025, 2026, 2027];

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 16 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.4, delay },
});

export default function AdminReports() {
  const now = new Date();
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterFromMonth, setFilterFromMonth] = useState(0);
  const [filterToMonth, setFilterToMonth] = useState(now.getMonth());

  // --- Data fetching ---
  const { data: clients } = useQuery({
    queryKey: ["report-clients"],
    queryFn: async () => { const { data, error } = await supabase.from("clients").select("*"); if (error) throw error; return data; },
  });
  const { data: payments } = useQuery({
    queryKey: ["report-payments"],
    queryFn: async () => { const { data, error } = await supabase.from("client_payments").select("*, clients(name)"); if (error) throw error; return data; },
  });
  const { data: projects } = useQuery({
    queryKey: ["report-projects"],
    queryFn: async () => { const { data, error } = await supabase.from("projects").select("*, clients(name)"); if (error) throw error; return data; },
  });
  const { data: expenses } = useQuery({
    queryKey: ["report-expenses"],
    queryFn: async () => { const { data, error } = await supabase.from("expenses").select("*"); if (error) throw error; return data; },
  });
  const { data: tasks } = useQuery({
    queryKey: ["report-tasks"],
    queryFn: async () => { const { data, error } = await supabase.from("tasks").select("*, clients(name)"); if (error) throw error; return data; },
  });
  const { data: timeEntries } = useQuery({
    queryKey: ["report-time-entries"],
    queryFn: async () => { const { data, error } = await supabase.from("time_entries").select("*"); if (error) throw error; return data; },
  });
  const { data: _overhead } = useQuery({
    queryKey: ["report-overhead"],
    queryFn: async () => { const { data, error } = await supabase.from("business_overhead").select("*"); if (error) throw error; return data; },
  });
  const { data: clientCosts } = useQuery({
    queryKey: ["report-client-costs"],
    queryFn: async () => { const { data, error } = await supabase.from("client_costs").select("*, clients(name)"); if (error) throw error; return data; },
  });

  // --- Helpers ---
  const isInRange = (month: number, year: number) =>
    year === filterYear && month - 1 >= filterFromMonth && month - 1 <= filterToMonth;
  const filteredMonthIndices = Array.from(
    { length: filterToMonth - filterFromMonth + 1 },
    (_, i) => filterFromMonth + i
  );
  const rangeLabel = filterFromMonth === 0 && filterToMonth === 11
    ? `${filterYear}` : `${MONTHS[filterFromMonth]}–${MONTHS[filterToMonth]} ${filterYear}`;

  // --- Core metrics ---
  const activeClients = (clients ?? []).filter((c) => c.status === "active");
  const actualPayments = (payments ?? []).filter((p) => p.notes !== "Projected");
  const filteredActualPayments = actualPayments.filter((p) => isInRange(p.payment_month, p.payment_year));
  const filteredExpenses = (expenses ?? []).filter((e) => isInRange(e.expense_month, e.expense_year));

  const totalRevenue = filteredActualPayments.reduce((s, p) => s + Number(p.amount), 0);
  const totalExpenses = filteredExpenses.reduce((s, e) => s + Number(e.amount), 0);

  // Use expenses table as single source of truth for costs (overhead & client costs are reference data only)
  const totalCosts = totalExpenses;

  const netProfit = totalRevenue - totalCosts;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const mrr = activeClients.reduce((s, c) => s + (c.monthly_fee ?? 0), 0);
  const avgRevenuePerClient = activeClients.length > 0 ? mrr / activeClients.length : 0;

  // --- YoY comparison ---
  const prevYearPayments = actualPayments.filter((p) => {
    const py = filterYear - 1;
    return p.payment_year === py && p.payment_month - 1 >= filterFromMonth && p.payment_month - 1 <= filterToMonth;
  });
  const prevRevenue = prevYearPayments.reduce((s, p) => s + Number(p.amount), 0);
  const revenueDelta = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : null;

  // --- Task analytics ---
  const allTasks = tasks ?? [];
  const completedTasks = allTasks.filter((t) => t.status === "done").length;
  const totalTasks = allTasks.length;
  const taskCompletionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  const today = new Date().toISOString().slice(0, 10);
  const overdueTasks = allTasks.filter((t) => t.status !== "done" && t.due_date && t.due_date < today);
  const upcomingTasks = allTasks.filter((t) => t.status !== "done" && t.due_date && t.due_date >= today && t.due_date <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const inProgressTasks = allTasks.filter((t) => t.status === "in_progress").length;
  const todoTasks = allTasks.filter((t) => t.status === "todo").length;

  const tasksByPriority = ["urgent", "high", "medium", "low"].map((p) => ({
    name: p.charAt(0).toUpperCase() + p.slice(1),
    total: allTasks.filter((t) => t.priority === p).length,
    done: allTasks.filter((t) => t.priority === p && t.status === "done").length,
    open: allTasks.filter((t) => t.priority === p && t.status !== "done").length,
  })).filter((d) => d.total > 0);

  const tasksByClient = activeClients.map((c) => {
    const ct = allTasks.filter((t) => t.client_id === c.id);
    return { name: c.name, total: ct.length, done: ct.filter((t) => t.status === "done").length, open: ct.filter((t) => t.status !== "done").length };
  }).filter((d) => d.total > 0).sort((a, b) => b.open - a.open);

  // --- Time entries analytics ---
  const filteredTimeEntries = (timeEntries ?? []).filter((te) => {
    const d = new Date(te.entry_date);
    return d.getFullYear() === filterYear && d.getMonth() >= filterFromMonth && d.getMonth() <= filterToMonth;
  });
  const totalHoursLogged = filteredTimeEntries.reduce((s, te) => s + Number(te.hours), 0);
  const workingDays = filteredMonthIndices.length * 22;
  const targetHours = workingDays * 8;
  const utilizationRate = targetHours > 0 ? (totalHoursLogged / targetHours) * 100 : 0;

  const hoursByCategory = Object.keys(CATEGORY_LABELS).map((cat) => ({
    name: CATEGORY_LABELS[cat],
    value: filteredTimeEntries.filter((te) => te.category === cat).reduce((s, te) => s + Number(te.hours), 0),
    fill: CATEGORY_COLORS[cat],
  })).filter((d) => d.value > 0);

  const billableHours = filteredTimeEntries.filter((te) => te.category === "client_work").reduce((s, te) => s + Number(te.hours), 0);
  const billableRate = totalHoursLogged > 0 ? (billableHours / totalHoursLogged) * 100 : 0;

  // Weekly hours trend
  const weeklyHours = useMemo(() => {
    const result: { week: string; hours: number }[] = [];
    if (filteredTimeEntries.length > 0) {
      const sorted = [...filteredTimeEntries].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
      const getWeekKey = (d: string) => {
        const date = new Date(d);
        const start = new Date(date);
        start.setDate(start.getDate() - start.getDay());
        return `${MONTHS[start.getMonth()]} ${start.getDate()}`;
      };
      const grouped: Record<string, number> = {};
      sorted.forEach((te) => {
        const wk = getWeekKey(te.entry_date);
        grouped[wk] = (grouped[wk] || 0) + Number(te.hours);
      });
      Object.entries(grouped).slice(-12).forEach(([week, hours]) => result.push({ week, hours: Math.round(hours * 10) / 10 }));
    }
    return result;
  }, [filteredTimeEntries]);

  // --- Revenue trend with profit line ---
  const revenueTrend = useMemo(() => filteredMonthIndices.map((i) => {
    const month = i + 1;
    const rev = actualPayments
      .filter((p) => p.payment_month === month && p.payment_year === filterYear)
      .reduce((s, p) => s + Number(p.amount), 0);
    const exp = (expenses ?? [])
      .filter((e) => e.expense_month === month && e.expense_year === filterYear)
      .reduce((s, e) => s + Number(e.amount), 0);
    return { label: MONTHS[i], revenue: rev, expenses: exp, profit: rev - exp };
  }), [filteredMonthIndices, actualPayments, expenses, filterYear]);

  // Revenue forecast with growth scenarios
  const forecastData = useMemo(() => {
    const growthRate = 0.03; // 3% monthly growth assumption
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      const base = mrr * Math.pow(1 + growthRate, i + 1);
      return {
        label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        conservative: Math.round(mrr),
        projected: Math.round(base),
        optimistic: Math.round(base * 1.1),
      };
    });
  }, [mrr, now]);

  const completedProjects = (projects ?? []).filter((p) => p.status === "completed").length;
  const activeProjects = (projects ?? []).filter((p) => p.status === "in_progress").length;

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

  // --- Client profitability ---
  const clientProfitability = useMemo(() => {
    return activeClients.map((client) => {
      const clientRev = actualPayments.filter((p) => p.client_id === client.id).reduce((s, p) => s + Number(p.amount), 0);
      const clientExp = (clientCosts ?? []).filter((c) => c.client_id === client.id).reduce((s, c) => s + Number(c.amount) * (c.is_monthly ? filteredMonthIndices.length : 1), 0);
      const profit = clientRev - clientExp;
      const margin = clientRev > 0 ? (profit / clientRev) * 100 : 0;
      return { name: client.name, revenue: clientRev, costs: clientExp, profit, margin };
    }).filter((c) => c.revenue > 0 || c.costs > 0).sort((a, b) => b.profit - a.profit);
  }, [activeClients, actualPayments, clientCosts, filteredMonthIndices]);

  // --- Client health ---
  const clientHealth = activeClients.map((client) => {
    const cp = actualPayments.filter((p) => p.client_id === client.id);
    const cProjects = (projects ?? []).filter((p) => p.client_id === client.id);
    const activeProjectCount = cProjects.filter((p) => p.status === "in_progress").length;
    const totalPaid = cp.reduce((s, p) => s + Number(p.amount), 0);
    const avgProgress = cProjects.length > 0
      ? cProjects.reduce((s, p) => s + p.progress, 0) / cProjects.length : 0;
    let health: "healthy" | "attention" | "critical" = "healthy";
    if (cp.length === 0 && activeProjectCount > 0) health = "critical";
    else if (activeProjectCount === 0 && client.status === "active") health = "attention";
    return { ...client, totalPaid, activeProjectCount, avgProgress, health, projectCount: cProjects.length };
  }).sort((a, b) => {
    const order = { critical: 0, attention: 1, healthy: 2 };
    return order[a.health] - order[b.health];
  });

  const revenueByClient = activeClients.map((c) => {
    const rev = actualPayments.filter((p) => p.client_id === c.id).reduce((s, p) => s + Number(p.amount), 0);
    return { name: c.name, value: rev };
  }).filter((c) => c.value > 0).sort((a, b) => b.value - a.value);

  const clientStatusDist = ["active", "onboarding", "prospect", "lead", "closed"].map((s) => ({
    name: s.charAt(0).toUpperCase() + s.slice(1),
    value: (clients ?? []).filter((c) => c.status === s).length,
  })).filter((s) => s.value > 0);

  // --- Profit waterfall ---
  const waterfallData = useMemo(() => [
    { name: "Revenue", value: totalRevenue, fill: "hsl(142, 71%, 45%)" },
    { name: "Expenses", value: -totalExpenses, fill: "hsl(0, 84%, 60%)" },
    { name: "Net Profit", value: netProfit, fill: netProfit >= 0 ? "hsl(213, 100%, 58%)" : "hsl(0, 84%, 60%)" },
  ], [totalRevenue, totalExpenses, netProfit]);

  // --- Utilization radial ---
  const utilizationRadial = [{ name: "Utilization", value: Math.min(utilizationRate, 100), fill: utilizationRate >= 70 ? "hsl(142, 71%, 45%)" : utilizationRate >= 40 ? "hsl(48, 96%, 53%)" : "hsl(0, 84%, 60%)" }];

  // --- KPIs with delta indicators ---
  const kpis = [
    { label: "Total Revenue", value: fmt(totalRevenue), icon: DollarSign, color: "text-emerald-400", delta: revenueDelta },
    { label: "Net Profit", value: fmt(netProfit), icon: TrendingUp, color: netProfit >= 0 ? "text-emerald-400" : "text-destructive", delta: null },
    { label: "Profit Margin", value: `${profitMargin.toFixed(1)}%`, icon: Target, color: profitMargin >= 20 ? "text-emerald-400" : "text-warning", delta: null },
    { label: "MRR", value: fmt(mrr), icon: DollarSign, color: "text-primary", delta: null },
    { label: "Active Clients", value: String(activeClients.length), icon: Users, color: "text-primary", delta: null },
    { label: "Billable Rate", value: `${billableRate.toFixed(0)}%`, icon: Clock, color: billableRate >= 60 ? "text-emerald-400" : "text-warning", delta: null },
  ];

  // --- Export ---
  const exportExcel = async () => {
    try {
      toast.info("Generating report...");
      const sections: string[][] = [];
      sections.push(
        ["BUSINESS KPIs — " + rangeLabel], ["Metric", "Value"],
        ["Total Revenue", fmt(totalRevenue)], ["Total Expenses", fmt(totalExpenses)],
        ["Net Profit", fmt(netProfit)], ["Profit Margin", `${profitMargin.toFixed(1)}%`],
        ["MRR", fmt(mrr)], ["Avg Revenue/Client", fmt(avgRevenuePerClient)],
        ["Active Clients", String(activeClients.length)], ["Active Projects", String(activeProjects)],
        ["Completed Projects", String(completedProjects)],
        ["Task Completion Rate", `${taskCompletionRate.toFixed(1)}%`],
        ["Total Hours Logged", `${totalHoursLogged.toFixed(1)}h`],
        ["Billable Rate", `${billableRate.toFixed(1)}%`],
        ["Overdue Tasks", String(overdueTasks.length)],
        [],
      );
      sections.push(
        ["REVENUE TREND — " + rangeLabel], ["Month", "Revenue", "Costs", "Profit"],
        ...revenueTrend.map((r) => [r.label, fmt(r.revenue), fmt(r.expenses), fmt(r.profit)]),
        [],
      );
      sections.push(
        ["CLIENT PROFITABILITY"], ["Client", "Revenue", "Costs", "Profit", "Margin"],
        ...clientProfitability.map((c) => [c.name, fmt(c.revenue), fmt(c.costs), fmt(c.profit), `${c.margin.toFixed(1)}%`]),
        [],
      );
      sections.push(
        ["TEAM UTILIZATION — " + rangeLabel], ["Category", "Hours"],
        ...hoursByCategory.map((c) => [c.name, `${c.value.toFixed(1)}h`]),
        [],
      );
      sections.push(
        ["CLIENT HEALTH SCORES"], ["Client", "Status", "Health", "Projects", "Avg Progress", "Total Paid"],
        ...clientHealth.map((c) => [c.name, c.status, HEALTH_COLORS[c.health].label, String(c.projectCount), `${c.avgProgress.toFixed(0)}%`, fmt(c.totalPaid)]),
        [],
      );
      sections.push(
        ["OVERDUE TASKS"], ["Task", "Client", "Due Date", "Priority"],
        ...overdueTasks.map((t) => [t.title, (t.clients as { name: string } | null)?.name ?? "—", t.due_date ?? "—", t.priority]),
      );
      const csv = sections.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vektiss-report-${rangeLabel.replace(/\s/g, "-")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded!");
    } catch {
      toast.error("Failed to generate report");
    }
  };

  return (
    <div className="space-y-6">
      <AICommandCenter pageContext={{ pageType: "reports", title: "Reports & Analytics" }} />
      {/* Header */}
      <motion.div {...anim(0)} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports & Analytics</h1>
          <p className="text-muted-foreground">KPIs, trends, profitability, utilization, and business intelligence.</p>
        </div>
        <Button variant="outline" onClick={exportExcel} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" /> Export Full Report
        </Button>
      </motion.div>

      {/* Date Range Filter */}
      <motion.div {...anim(0.05)}>
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">Period:</span>
              <Select value={String(filterYear)} onValueChange={(v) => setFilterYear(Number(v))}>
                <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{YEAR_OPTIONS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={String(filterFromMonth)} onValueChange={(v) => { const m = Number(v); setFilterFromMonth(m); if (m > filterToMonth) setFilterToMonth(m); }}>
                <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">to</span>
              <Select value={String(filterToMonth)} onValueChange={(v) => { const m = Number(v); setFilterToMonth(m); if (m < filterFromMonth) setFilterFromMonth(m); }}>
                <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i)} disabled={i < filterFromMonth}>{m}</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex gap-1 ml-auto">
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setFilterFromMonth(0); setFilterToMonth(2); }}>Q1</Button>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setFilterFromMonth(3); setFilterToMonth(5); }}>Q2</Button>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setFilterFromMonth(6); setFilterToMonth(8); }}>Q3</Button>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setFilterFromMonth(9); setFilterToMonth(11); }}>Q4</Button>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setFilterFromMonth(0); setFilterToMonth(11); }}>Full Year</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {kpis.map((kpi, i) => (
          <motion.div key={kpi.label} {...anim(0.1 + i * 0.04)}>
            <Card className="hover:border-primary/20 transition-colors relative overflow-hidden">
              <div className="absolute top-0 right-0 h-16 w-16 bg-primary/[0.03] rounded-bl-full" />
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground">{kpi.label}</CardTitle>
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <kpi.icon className={`h-3.5 w-3.5 ${kpi.color}`} />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className={`text-xl font-bold font-mono ${kpi.color}`}>{kpi.value}</div>
                {kpi.delta !== null && (
                  <div className={`flex items-center gap-1 mt-1 text-xs ${kpi.delta >= 0 ? "text-emerald-400" : "text-destructive"}`}>
                    {kpi.delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    <span className="font-mono">{Math.abs(kpi.delta).toFixed(1)}%</span>
                    <span className="text-muted-foreground">vs last year</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Revenue Trend — ComposedChart with profit line */}
      <motion.div {...anim(0.35)}>
        <Card className="hover:border-primary/20 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" /> Revenue vs Costs ({rangeLabel})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={revenueTrend}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => [fmt(v), name]} />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} opacity={0.8} />
                  <Bar dataKey="expenses" name="Total Costs" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} opacity={0.6} />
                  <Line type="monotone" dataKey="profit" name="Profit" stroke="hsl(213, 100%, 58%)" strokeWidth={2.5} dot={{ r: 4, fill: "hsl(213, 100%, 58%)" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Profit Waterfall + Utilization + Hours by Category */}
      <motion.div {...anim(0.4)} className="grid gap-4 lg:grid-cols-3">
        {/* Profit Waterfall */}
        <Card className="hover:border-primary/20 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> Profit Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {waterfallData.map((item) => {
                const absVal = Math.abs(item.value);
                const maxVal = Math.max(...waterfallData.map((d) => Math.abs(d.value)), 1);
                const pct = (absVal / maxVal) * 100;
                return (
                  <div key={item.name} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{item.name}</span>
                      <span className="font-mono font-semibold" style={{ color: item.fill }}>
                        {item.value < 0 ? "−" : ""}{fmt(absVal)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: item.fill }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Utilization Gauge */}
        <Card className="hover:border-primary/20 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" /> Team Utilization
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <div className="h-44 w-44">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%" startAngle={180} endAngle={0} data={utilizationRadial} barSize={14}>
                  <RadialBar dataKey="value" cornerRadius={10} background={{ fill: "hsl(var(--muted))" }} />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center -mt-10">
              <p className="text-3xl font-bold font-mono">{utilizationRate.toFixed(0)}%</p>
              <p className="text-xs text-muted-foreground">{totalHoursLogged.toFixed(0)}h / {targetHours}h target</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5 w-full text-center">
              <div className="rounded-lg bg-primary/5 p-2.5">
                <p className="text-lg font-bold font-mono text-primary">{billableHours.toFixed(0)}h</p>
                <p className="text-[10px] text-muted-foreground">Billable</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-lg font-bold font-mono">{(totalHoursLogged - billableHours).toFixed(0)}h</p>
                <p className="text-[10px] text-muted-foreground">Non-Billable</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Task Health Overview */}
        <Card className="hover:border-primary/20 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" /> Task Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-lg bg-destructive/10 p-2.5 text-center">
                <AlertCircle className="h-3.5 w-3.5 text-destructive mx-auto mb-0.5" />
                <p className="text-xl font-bold font-mono text-destructive">{overdueTasks.length}</p>
                <p className="text-[10px] text-muted-foreground">Overdue</p>
              </div>
              <div className="rounded-lg bg-warning/10 p-2.5 text-center">
                <Clock className="h-3.5 w-3.5 text-warning mx-auto mb-0.5" />
                <p className="text-xl font-bold font-mono text-warning">{upcomingTasks.length}</p>
                <p className="text-[10px] text-muted-foreground">Due This Week</p>
              </div>
              <div className="rounded-lg bg-primary/10 p-2.5 text-center">
                <Activity className="h-3.5 w-3.5 text-primary mx-auto mb-0.5" />
                <p className="text-xl font-bold font-mono text-primary">{inProgressTasks}</p>
                <p className="text-[10px] text-muted-foreground">In Progress</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                <Target className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-0.5" />
                <p className="text-xl font-bold font-mono">{todoTasks}</p>
                <p className="text-[10px] text-muted-foreground">To Do</p>
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">By Priority</p>
              <div className="space-y-2">
                {tasksByPriority.map((tp) => (
                  <div key={tp.name} className="flex items-center gap-2">
                    <span className="text-xs font-medium w-14">{tp.name}</span>
                    <Progress value={tp.total > 0 ? (tp.done / tp.total) * 100 : 0} className="h-1.5 flex-1" />
                    <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">{tp.done}/{tp.total}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Weekly Hours + Revenue Forecast */}
      <motion.div {...anim(0.45)} className="grid gap-4 lg:grid-cols-2">
        <Card className="hover:border-primary/20 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" /> Weekly Hours Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {weeklyHours.length > 0 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyHours}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}h`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)}h`, "Hours"]} />
                    <Bar dataKey="hours" fill="hsl(213, 100%, 58%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-16">No time entries in this period</p>
            )}
          </CardContent>
        </Card>

        {/* Revenue Forecast with scenarios */}
        <Card className="hover:border-primary/20 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" /> Revenue Forecast
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecastData}>
                  <defs>
                    <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(213, 100%, 58%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(213, 100%, 58%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="optimisticGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmt(v)]} />
                  <Legend />
                  <Area type="monotone" dataKey="optimistic" name="Optimistic (+10%)" stroke="hsl(142, 71%, 45%)" fill="url(#optimisticGrad)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                  <Area type="monotone" dataKey="projected" name="Projected (3% growth)" stroke="hsl(213, 100%, 58%)" fill="url(#forecastGrad)" strokeWidth={2} dot={{ r: 3, fill: "hsl(213, 100%, 58%)" }} />
                  <Area type="monotone" dataKey="conservative" name="Conservative (flat)" stroke="hsl(var(--muted-foreground))" fill="none" strokeWidth={1.5} strokeDasharray="6 4" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Based on current MRR of {fmt(mrr)}/month from {activeClients.length} active clients
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Client Profitability + Revenue by Client */}
      <motion.div {...anim(0.5)} className="grid gap-4 lg:grid-cols-2">
        {/* Client Profitability */}
        <Card className="hover:border-primary/20 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" /> Client Profitability
            </CardTitle>
          </CardHeader>
          <CardContent>
            {clientProfitability.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Costs</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientProfitability.map((c) => (
                    <TableRow key={c.name} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right font-mono text-emerald-400">{fmt(c.revenue)}</TableCell>
                      <TableCell className="text-right font-mono text-destructive">{fmt(c.costs)}</TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${c.profit >= 0 ? "text-primary" : "text-destructive"}`}>{fmt(c.profit)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={`text-xs font-mono ${c.margin >= 50 ? "text-emerald-400 border-emerald-400/30" : c.margin >= 20 ? "text-warning border-warning/30" : "text-destructive border-destructive/30"}`}>
                          {c.margin.toFixed(0)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">No profitability data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Revenue by Client Pie */}
        <Card className="hover:border-primary/20 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> Revenue by Client
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revenueByClient.length > 0 ? (
              <div className="h-56">
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
                    <Pie data={revenueByClient} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" strokeWidth={0}>
                      {revenueByClient.map((_, i) => <Cell key={i} fill={`url(#pieGrad${i % PIE_COLORS.length})`} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">No revenue data yet</p>
            )}
            <div className="flex flex-wrap gap-2.5 mt-3 justify-center">
              {revenueByClient.map((c, i) => (
                <div key={c.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-muted-foreground">{c.name}</span>
                  <span className="font-mono font-semibold">{fmt(c.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Project Pipeline + Client Distribution */}
      <motion.div {...anim(0.55)} className="grid gap-4 lg:grid-cols-2">
        <Card className="hover:border-primary/20 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-primary" /> Project Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-3">Active Projects by Phase</p>
              {phaseDist.length > 0 ? (
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={phaseDist} layout="vertical" barSize={18}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={90} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted) / 0.3)" }} />
                      <Bar dataKey="value" name="Projects" radius={[0, 6, 6, 0]}>
                        {phaseDist.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No active projects</p>
              )}
            </div>
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
                <div><p className="text-2xl font-bold font-mono text-primary">{activeProjects}</p><p className="text-xs text-muted-foreground">Active</p></div>
                <div><p className="text-2xl font-bold font-mono text-emerald-400">{completedProjects}</p><p className="text-xs text-muted-foreground">Completed</p></div>
                <div><p className="text-2xl font-bold font-mono">{(projects ?? []).length}</p><p className="text-xs text-muted-foreground">Total</p></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Hours by Category + Client Distribution */}
        <Card className="hover:border-primary/20 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" /> Hours by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hoursByCategory.length > 0 ? (
              <>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={hoursByCategory} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3} dataKey="value" strokeWidth={0}>
                        {hoursByCategory.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)}h`]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-2.5 justify-center">
                  {hoursByCategory.map((c) => (
                    <div key={c.name} className="flex items-center gap-1.5 text-xs">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.fill }} />
                      <span className="text-muted-foreground">{c.name}</span>
                      <span className="font-mono font-semibold">{c.value.toFixed(0)}h</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No time entries in this period</p>
            )}
            <div className="border-t border-border mt-5 pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" /> Client Distribution
              </p>
              <div className="space-y-2.5">
                {clientStatusDist.map((s) => (
                  <div key={s.name} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{s.name}</span>
                    <div className="flex items-center gap-3">
                      <Progress value={(s.value / (clients?.length || 1)) * 100} className="h-2 w-28" />
                      <span className="text-sm font-mono font-semibold w-6 text-right">{s.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tasks by Client */}
      {tasksByClient.length > 0 && (
        <motion.div {...anim(0.6)}>
          <Card className="hover:border-primary/20 transition-colors">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" /> Task Load by Client
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tasksByClient} layout="vertical" barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar dataKey="done" name="Done" stackId="a" fill="hsl(142, 71%, 45%)" />
                    <Bar dataKey="open" name="Open" stackId="a" fill="hsl(213, 100%, 58%)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Client Health Table */}
      <motion.div {...anim(0.65)}>
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
                        <TableCell><Badge variant="outline" className="text-xs capitalize">{c.status}</Badge></TableCell>
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

      {/* Overdue Tasks Table */}
      {overdueTasks.length > 0 && (
        <motion.div {...anim(0.7)}>
          <Card className="hover:border-destructive/20 transition-colors border-destructive/10">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" /> Overdue Tasks ({overdueTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdueTasks.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")).map((t) => (
                    <TableRow key={t.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">{t.title}</TableCell>
                      <TableCell className="text-muted-foreground">{(t.clients as { name: string } | null)?.name ?? "—"}</TableCell>
                      <TableCell className="font-mono text-sm text-destructive">{t.due_date}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs capitalize">{t.priority}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className="text-xs capitalize">{t.status.replace(/_/g, " ")}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
