import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Users, Clock, Shield, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(val);
}

function formatDays(val: number) {
  return val < 1 ? "< 1d" : `${Math.round(val)}d`;
}

export function ExecutiveKPICards() {
  const { data: clients } = useQuery({
    queryKey: ["exec-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, status, created_at, start_date");
      if (error) throw error;
      return data;
    },
  });

  const { data: projects } = useQuery({
    queryKey: ["exec-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, status, created_at, updated_at, current_phase, progress, start_date, target_date");
      if (error) throw error;
      return data;
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["exec-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_payments")
        .select("amount, payment_year, payment_month, notes")
        .neq("notes", "Projected");
      if (error) throw error;
      return data;
    },
  });

  const allClients = clients ?? [];
  const allProjects = projects ?? [];
  const allPayments = payments ?? [];

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // --- Churn & Retention ---
  const activeClients = allClients.filter((c) => c.status === "active").length;
  const closedClients = allClients.filter((c) => c.status === "closed").length;
  const totalEverActive = activeClients + closedClients;
  const churnRate = totalEverActive > 0 ? (closedClients / totalEverActive) * 100 : 0;
  const retentionRate = 100 - churnRate;

  // --- Average client lifetime (days) ---
  const clientsWithDates = allClients.filter((c) => c.start_date);
  const avgLifetime = clientsWithDates.length > 0
    ? clientsWithDates.reduce((sum, c) => {
        const start = new Date(c.start_date!);
        const end = c.status === "closed" ? new Date(c.created_at) : now;
        return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      }, 0) / clientsWithDates.length
    : 0;

  // --- Average project duration (completed only) ---
  const completedProjects = allProjects.filter((p) => p.status === "completed" && p.start_date);
  const avgProjectDuration = completedProjects.length > 0
    ? completedProjects.reduce((sum, p) => {
        const start = new Date(p.start_date!);
        const end = new Date(p.updated_at);
        return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      }, 0) / completedProjects.length
    : 0;

  // --- Project completion rate ---
  const totalProjects = allProjects.length;
  const completionRate = totalProjects > 0
    ? (completedProjects.length / totalProjects) * 100
    : 0;

  // --- Revenue trend (this month vs last month) ---
  const thisMonthRev = allPayments
    .filter((p) => p.payment_year === currentYear && p.payment_month === currentMonth)
    .reduce((s, p) => s + Number(p.amount), 0);

  const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const lastMonthRev = allPayments
    .filter((p) => p.payment_year === lastMonthYear && p.payment_month === lastMonth)
    .reduce((s, p) => s + Number(p.amount), 0);

  const revDelta = lastMonthRev > 0 ? ((thisMonthRev - lastMonthRev) / lastMonthRev) * 100 : 0;

  // --- At-risk projects (overdue target date or on_hold) ---
  const atRiskCount = allProjects.filter((p) => {
    if (p.status === "on_hold") return true;
    if (p.target_date && p.status !== "completed" && new Date(p.target_date) < now) return true;
    return false;
  }).length;

  const kpis = [
    {
      label: "Retention Rate",
      value: `${retentionRate.toFixed(0)}%`,
      sub: `${closedClients} churned of ${totalEverActive}`,
      icon: Shield,
      color: retentionRate >= 80 ? "text-emerald-500" : "text-warning",
      trend: retentionRate >= 80 ? "up" as const : "down" as const,
    },
    {
      label: "Avg Client Lifetime",
      value: avgLifetime > 365 ? `${(avgLifetime / 365).toFixed(1)}y` : `${Math.round(avgLifetime)}d`,
      sub: `${clientsWithDates.length} clients tracked`,
      icon: Users,
      color: "text-primary",
      trend: null,
    },
    {
      label: "Avg Project Duration",
      value: formatDays(avgProjectDuration),
      sub: `${completedProjects.length} completed`,
      icon: Clock,
      color: "text-primary",
      trend: null,
    },
    {
      label: "Completion Rate",
      value: `${completionRate.toFixed(0)}%`,
      sub: `${completedProjects.length}/${totalProjects} projects`,
      icon: BarChart3,
      color: completionRate >= 50 ? "text-emerald-500" : "text-warning",
      trend: completionRate >= 50 ? "up" as const : "down" as const,
    },
    {
      label: "Revenue Trend",
      value: formatCurrency(thisMonthRev),
      sub: revDelta !== 0 ? `${revDelta > 0 ? "+" : ""}${revDelta.toFixed(0)}% vs last month` : "No prior data",
      icon: TrendingUp,
      color: revDelta >= 0 ? "text-emerald-500" : "text-destructive",
      trend: revDelta >= 0 ? "up" as const : "down" as const,
    },
    {
      label: "At-Risk Projects",
      value: atRiskCount.toString(),
      sub: atRiskCount > 0 ? "Overdue or on hold" : "All on track",
      icon: TrendingDown,
      color: atRiskCount === 0 ? "text-emerald-500" : "text-destructive",
      trend: atRiskCount === 0 ? "up" as const : "down" as const,
    },
  ];

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Executive Summary</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 + i * 0.05 }}
          >
            <Card className="border-border hover:border-primary/20 transition-colors">
              <CardContent className="pt-4 pb-4 flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-bold text-xl leading-none">{kpi.value}</p>
                    {kpi.trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
                    {kpi.trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">{kpi.sub}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
