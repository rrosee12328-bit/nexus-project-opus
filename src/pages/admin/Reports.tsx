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
  BarChart3, Users, DollarSign, TrendingUp, Download, Activity, Heart, AlertTriangle,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { motion } from "framer-motion";

function fmt(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(val);
}

const HEALTH_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  healthy: { bg: "bg-emerald-500/20", text: "text-emerald-400", label: "Healthy" },
  attention: { bg: "bg-warning/20", text: "text-warning", label: "Needs Attention" },
  critical: { bg: "bg-destructive/20", text: "text-destructive", label: "Critical" },
};

const PIE_COLORS = ["hsl(142, 71%, 45%)", "hsl(48, 96%, 53%)", "hsl(0, 84%, 60%)", "hsl(262, 80%, 50%)", "hsl(200, 80%, 50%)"];

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
  const totalRevenue = (payments ?? []).filter((p) => p.notes !== "Projected").reduce((s, p) => s + Number(p.amount), 0);
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

  // Client health scores
  const clientHealth = activeClients.map((client) => {
    const clientPayments = (payments ?? []).filter((p) => p.client_id === client.id && p.notes !== "Projected");
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
    const rev = (payments ?? []).filter((p) => p.client_id === c.id && p.notes !== "Projected").reduce((s, p) => s + Number(p.amount), 0);
    return { name: c.name, value: rev };
  }).filter((c) => c.value > 0).sort((a, b) => b.value - a.value);

  // Status distribution for pie
  const statusDist = ["active", "onboarding", "prospect", "lead", "closed"].map((s) => ({
    name: s.charAt(0).toUpperCase() + s.slice(1),
    value: (clients ?? []).filter((c) => c.status === s).length,
  })).filter((s) => s.value > 0);

  const exportReport = () => {
    const rows = [
      ["Client Health Report"],
      ["Client", "Status", "Health", "Projects", "Avg Progress", "Total Paid"],
      ...clientHealth.map((c) => [
        c.name, c.status, HEALTH_COLORS[c.health].label,
        String(c.projectCount), `${c.avgProgress.toFixed(0)}%`, fmt(c.totalPaid),
      ]),
      [],
      ["Summary KPIs"],
      ["Metric", "Value"],
      ["Total Revenue", fmt(totalRevenue)],
      ["Total Expenses", fmt(totalExpenses)],
      ["Net Profit", fmt(netProfit)],
      ["Profit Margin", `${profitMargin.toFixed(1)}%`],
      ["MRR", fmt(mrr)],
      ["Active Clients", String(activeClients.length)],
      ["Task Completion Rate", `${taskCompletionRate.toFixed(1)}%`],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vektiss-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
      <motion.div {...anim(0)} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports & Analytics</h1>
          <p className="text-muted-foreground">KPIs, client health, and business intelligence.</p>
        </div>
        <Button variant="outline" onClick={exportReport}>
          <Download className="mr-2 h-4 w-4" /> Export Report
        </Button>
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

      {/* Charts row */}
      <motion.div {...anim(0.45)} className="grid gap-4 lg:grid-cols-2">
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
                    <Pie data={revenueByClient} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value">
                      {revenueByClient.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", color: "hsl(var(--foreground))" }} />
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
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/20 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Client Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {statusDist.map((s) => (
                <div key={s.name} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{s.name}</span>
                  <div className="flex items-center gap-3">
                    <Progress value={(s.value / (clients?.length || 1)) * 100} className="h-2 w-32" />
                    <span className="text-sm font-mono font-semibold w-6 text-right">{s.value}</span>
                  </div>
                </div>
              ))}
              <div className="pt-4 grid grid-cols-3 gap-4 text-center border-t border-border">
                <div>
                  <p className="text-2xl font-bold font-mono text-primary">{activeProjects}</p>
                  <p className="text-xs text-muted-foreground">Active Projects</p>
                </div>
                <div>
                  <p className="text-2xl font-bold font-mono text-emerald-400">{completedProjects}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
                <div>
                  <p className="text-2xl font-bold font-mono">{(projects ?? []).length}</p>
                  <p className="text-xs text-muted-foreground">Total Projects</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Client Health Table */}
      <motion.div {...anim(0.55)}>
        <Card className="hover:border-primary/20 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Heart className="h-5 w-5 text-primary" /> Client Health Scores
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
