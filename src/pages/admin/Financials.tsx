import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DollarSign, TrendingUp, TrendingDown, Download, Wallet, Plus, Pencil, Trash2 } from "lucide-react";
import { Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, ComposedChart, Legend } from "recharts";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { motion } from "framer-motion";
import { toast } from "sonner";
import ExpenseCrudDialog from "@/components/financials/ExpenseCrudDialog";
import InvestmentCrudDialog from "@/components/financials/InvestmentCrudDialog";
import OverheadCrudDialog from "@/components/financials/OverheadCrudDialog";

const statusColor: Record<string, string> = {
  active: "bg-success/20 text-success border-success/30",
  onboarding: "bg-warning/20 text-warning border-warning/30",
  closed: "bg-muted text-muted-foreground border-border",
  prospect: "bg-primary/20 text-primary border-primary/30",
  lead: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(val);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function AdminFinancials() {
  const queryClient = useQueryClient();
  const [chartView, setChartView] = useState<"actual" | "projected" | "all">("all");

  // CRUD dialog state
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [investmentOpen, setInvestmentOpen] = useState(false);
  const [editingInvestment, setEditingInvestment] = useState<any>(null);
  const [overheadOpen, setOverheadOpen] = useState(false);
  const [editingOverhead, setEditingOverhead] = useState<any>(null);

  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => { toast.success("Expense deleted"); queryClient.invalidateQueries({ queryKey: ["expenses"] }); logActivity("deleted_expense", "expense", id, "Deleted an expense"); },
    onError: () => toast.error("Failed to delete"),
  });
  const deleteInvestment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("investments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => { toast.success("Investment deleted"); queryClient.invalidateQueries({ queryKey: ["investments"] }); logActivity("deleted_investment", "investment", id, "Deleted an investment"); },
    onError: () => toast.error("Failed to delete"),
  });
  const deleteOverhead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("business_overhead").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => { toast.success("Overhead deleted"); queryClient.invalidateQueries({ queryKey: ["business-overhead"] }); logActivity("deleted_overhead", "overhead", id, "Deleted an overhead item"); },
    onError: () => toast.error("Failed to delete"),
  });
  const { data: payments } = useQuery({
    queryKey: ["all-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_payments")
        .select("*, clients(name)")
        .order("payment_year")
        .order("payment_month");
      if (error) throw error;
      return data;
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: expenses } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("expense_year")
        .order("expense_month");
      if (error) throw error;
      return data;
    },
  });

  const { data: investments } = useQuery({
    queryKey: ["investments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("investments").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: clientCosts } = useQuery({
    queryKey: ["client-costs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_costs").select("*, clients(name, monthly_fee, status)");
      if (error) throw error;
      return data;
    },
  });

  const { data: overhead } = useQuery({
    queryKey: ["business-overhead"],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_overhead").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Split payments into actual vs projected
  const actualPayments = (payments ?? []).filter((p) => p.notes !== "Projected");
  const projectedPayments = (payments ?? []).filter((p) => p.notes === "Projected");

  // Monthly chart data with actual/projected split
  const monthlyData = MONTHS.map((label, i) => {
    const month = i + 1;
    const actualRev = actualPayments
      .filter((p) => p.payment_month === month && p.payment_year === 2026)
      .reduce((s, p) => s + Number(p.amount), 0);
    const projectedRev = projectedPayments
      .filter((p) => p.payment_month === month && p.payment_year === 2026)
      .reduce((s, p) => s + Number(p.amount), 0);
    const expense = (expenses ?? [])
      .filter((e) => e.expense_month === month && e.expense_year === 2026)
      .reduce((s, e) => s + Number(e.amount), 0);
    return {
      month: label,
      actualRevenue: actualRev,
      projectedRevenue: projectedRev,
      expenses: expense,
      actualProfit: actualRev - expense,
      totalProfit: actualRev + projectedRev - expense,
    };
  });

  const ytdRevenue = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const ytdExpenses = (expenses ?? [])
    .filter((e) => e.expense_month <= new Date().getMonth() + 1 && e.expense_year === 2026)
    .reduce((s, e) => s + Number(e.amount), 0);
  const ytdProfit = ytdRevenue - ytdExpenses;
  const activeMrr = (clients ?? [])
    .filter((c) => c.status === "active")
    .reduce((s, c) => s + (c.monthly_fee ?? 0), 0);
  const totalInvestments = (investments ?? []).reduce((s, inv) => s + Number(inv.amount), 0);

  // Group expenses by type
  const expenseTypes = [...new Set((expenses ?? []).map((e) => e.type))];

  const exportCSV = () => {
    if (!payments?.length) return;
    const rows = [["Client", "Month", "Year", "Amount"]];
    for (const p of payments) {
      const clientName = (p.clients as { name: string } | null)?.name ?? "Unknown";
      rows.push([clientName, MONTHS[p.payment_month - 1], String(p.payment_year), String(p.amount)]);
    }
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vektiss-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statCards = [
    { label: "YTD Revenue", value: formatCurrency(ytdRevenue), icon: TrendingUp, color: "text-emerald-400" },
    { label: "YTD Expenses", value: formatCurrency(ytdExpenses), icon: TrendingDown, color: "text-destructive" },
    { label: "YTD Profit", value: formatCurrency(ytdProfit), icon: DollarSign, color: ytdProfit >= 0 ? "text-emerald-400" : "text-destructive" },
    { label: "Monthly Recurring", value: formatCurrency(activeMrr), icon: DollarSign, color: "text-primary" },
    { label: "Investments", value: formatCurrency(totalInvestments), icon: Wallet, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financial Tracking</h1>
          <p className="text-muted-foreground">Revenue, expenses, profit margins, and investment tracking.</p>
        </div>
        <Button variant="outline" onClick={exportCSV}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.07 }}
          >
            <Card className="group hover:border-primary/20 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold font-mono ${s.label === "YTD Profit" ? s.color : ""}`}>{s.value}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Revenue vs Expenses Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.45 }}
      >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Revenue vs Expenses (2026)</CardTitle>
          <ToggleGroup type="single" value={chartView} onValueChange={(v) => v && setChartView(v as typeof chartView)} size="sm">
            <ToggleGroupItem value="actual" className="text-xs px-3">Actual</ToggleGroupItem>
            <ToggleGroupItem value="projected" className="text-xs px-3">Projected</ToggleGroupItem>
            <ToggleGroupItem value="all" className="text-xs px-3">All</ToggleGroupItem>
          </ToggleGroup>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `$${v / 1000}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", color: "hsl(var(--foreground))" }}
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                />
                <Legend />
                {(chartView === "actual" || chartView === "all") && (
                  <Bar dataKey="actualRevenue" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} name="Actual Revenue" stackId="revenue" />
                )}
                {(chartView === "projected" || chartView === "all") && (
                  <Bar dataKey="projectedRevenue" fill="hsl(142 71% 45% / 0.4)" radius={[4, 4, 0, 0]} name="Projected Revenue" stackId="revenue" />
                )}
                <Bar dataKey="expenses" fill="hsl(0 84% 60%)" radius={[4, 4, 0, 0]} name="Expenses" />
                <Line
                  type="monotone"
                  dataKey={chartView === "actual" ? "actualProfit" : "totalProfit"}
                  stroke="hsl(225 100% 61%)"
                  strokeWidth={2}
                  name="Profit"
                  dot={{ r: 3 }}
                  strokeDasharray={chartView === "projected" ? "5 5" : undefined}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.55 }}
        className="grid gap-4 lg:grid-cols-2"
      >
        {/* Expenses Breakdown by Month */}
        <Card className="hover:border-primary/20 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Expense Breakdown by Month</CardTitle>
            <Button variant="outline" size="sm" onClick={() => { setEditingExpense(null); setExpenseOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Expense Type</TableHead>
                    {MONTHS.slice(0, 6).map((m) => (
                      <TableHead key={m} className="text-right">{m}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenseTypes.map((type) => (
                    <TableRow key={type} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="whitespace-nowrap">{type}</TableCell>
                      {MONTHS.slice(0, 6).map((_, i) => {
                        const val = (expenses ?? [])
                          .filter((e) => e.type === type && e.expense_month === i + 1 && e.expense_year === 2026)
                          .reduce((s, e) => s + Number(e.amount), 0);
                        return (
                          <TableCell key={i} className="text-right font-mono">
                            {val > 0 ? formatCurrency(val) : "—"}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2 border-border">
                    <TableCell>Total</TableCell>
                    {MONTHS.slice(0, 6).map((_, i) => {
                      const total = (expenses ?? [])
                        .filter((e) => e.expense_month === i + 1 && e.expense_year === 2026)
                        .reduce((s, e) => s + Number(e.amount), 0);
                      return (
                        <TableCell key={i} className="text-right font-mono">
                          {total > 0 ? formatCurrency(total) : "—"}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Owner Investments */}
        <Card className="hover:border-primary/20 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Owner Investments</CardTitle>
            <Button variant="outline" size="sm" onClick={() => { setEditingInvestment(null); setInvestmentOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Owner</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(investments ?? []).map((inv) => (
                  <TableRow key={inv.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium">{inv.owner_name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {inv.investment_date ? new Date(inv.investment_date).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{inv.notes ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(inv.amount))}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingInvestment(inv); setInvestmentOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteInvestment.mutate(inv.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2 border-border">
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(totalInvestments)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </motion.div>

      {/* Client Profitability */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.65 }}
      >
      <Card className="hover:border-primary/20 transition-colors">
        <CardHeader>
          <CardTitle className="text-lg">Client Profitability</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Direct Costs</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const grouped: Record<string, { name: string; revenue: number; costs: number; status: string }> = {};
                  for (const cost of clientCosts ?? []) {
                    const client = cost.clients as { name: string; monthly_fee: number | null; status: string } | null;
                    if (!client) continue;
                    if (!grouped[cost.client_id]) {
                      grouped[cost.client_id] = {
                        name: client.name,
                        revenue: Number(client.monthly_fee ?? 0),
                        costs: 0,
                        status: client.status,
                      };
                    }
                    grouped[cost.client_id].costs += Number(cost.amount);
                  }
                  const entries = Object.values(grouped).sort((a, b) => (b.revenue - b.costs) - (a.revenue - a.costs));
                  const totalRev = entries.reduce((s, e) => s + e.revenue, 0);
                  const totalCost = entries.reduce((s, e) => s + e.costs, 0);

                  return (
                    <>
                      {entries.map((e) => {
                        const profit = e.revenue - e.costs;
                        const margin = e.revenue > 0 ? (profit / e.revenue) * 100 : 0;
                        return (
                          <TableRow key={e.name} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="font-medium">
                              {e.name}
                              {e.status === "closed" && <span className="text-xs text-muted-foreground ml-2">(closed)</span>}
                            </TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(e.revenue)}</TableCell>
                            <TableCell className="text-right font-mono text-destructive">{formatCurrency(e.costs)}</TableCell>
                            <TableCell className={`text-right font-mono ${profit >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                              {formatCurrency(profit)}
                            </TableCell>
                            <TableCell className={`text-right font-mono ${margin >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                              {margin.toFixed(1)}%
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="font-bold border-t-2 border-border">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(totalRev)}</TableCell>
                        <TableCell className="text-right font-mono text-destructive">{formatCurrency(totalCost)}</TableCell>
                        <TableCell className={`text-right font-mono ${totalRev - totalCost >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                          {formatCurrency(totalRev - totalCost)}
                        </TableCell>
                        <TableCell className={`text-right font-mono ${totalRev > 0 && (totalRev - totalCost) / totalRev >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                          {totalRev > 0 ? (((totalRev - totalCost) / totalRev) * 100).toFixed(1) : "0.0"}%
                        </TableCell>
                      </TableRow>
                    </>
                  );
                })()}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </motion.div>

      {/* Business Overhead */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.7 }}
      >
      <Card className="hover:border-primary/20 transition-colors">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Business Overhead</CardTitle>
          <Button variant="outline" size="sm" onClick={() => { setEditingOverhead(null); setOverheadOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(overhead ?? []).map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell>
                    <Badge variant="outline">{item.category}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{item.details ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(Number(item.amount))}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingOverhead(item); setOverheadOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteOverhead.mutate(item.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-bold border-t-2 border-border">
                <TableCell colSpan={3}>Total Monthly Overhead</TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency((overhead ?? []).reduce((s, o) => s + Number(o.amount), 0))}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </motion.div>

      {/* Revenue Projection Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.75 }}
      >
      <Card className="hover:border-primary/20 transition-colors">
        <CardHeader>
          <CardTitle className="text-lg">Revenue Projection & Net Profit Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  {MONTHS.slice(0, 6).map((m) => (
                    <TableHead key={m} className="text-right">{m}</TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const clientMap = new Map((clients ?? []).map((c) => [c.id, c]));
                  const allPayments = payments ?? [];
                  const byClient: Record<string, { name: string; status: string; months: number[] }> = {};
                  for (const p of allPayments) {
                    if (p.payment_year !== 2026 || p.payment_month < 1 || p.payment_month > 6) continue;
                    const client = clientMap.get(p.client_id);
                    const name = (p.clients as { name: string } | null)?.name ?? "Unknown";
                    if (!byClient[p.client_id]) {
                      byClient[p.client_id] = { name, status: client?.status ?? "", months: [0,0,0,0,0,0] };
                    }
                    byClient[p.client_id].months[p.payment_month - 1] += Number(p.amount);
                  }
                  const entries = Object.values(byClient).sort((a, b) => {
                    const totalA = a.months.reduce((s, v) => s + v, 0);
                    const totalB = b.months.reduce((s, v) => s + v, 0);
                    return totalB - totalA;
                  });
                  const monthTotals = [0,0,0,0,0,0];
                  entries.forEach((e) => e.months.forEach((v, i) => { monthTotals[i] += v; }));
                  const grandTotal = monthTotals.reduce((s, v) => s + v, 0);

                  return (
                    <>
                      {entries.map((e) => {
                        const total = e.months.reduce((s, v) => s + v, 0);
                        return (
                          <TableRow key={e.name} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="font-medium whitespace-nowrap">{e.name}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className={`text-xs ${statusColor[e.status] ?? ""}`}>{e.status}</Badge>
                            </TableCell>
                            {e.months.map((v, i) => (
                              <TableCell key={i} className={`text-right font-mono text-sm ${i >= 3 ? "italic text-muted-foreground" : ""}`}>
                                {v > 0 ? formatCurrency(v) : "—"}
                              </TableCell>
                            ))}
                            <TableCell className="text-right font-mono font-semibold">{formatCurrency(total)}</TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="font-bold border-t-2 border-border">
                        <TableCell colSpan={2}>Monthly Totals</TableCell>
                        {monthTotals.map((v, i) => (
                          <TableCell key={i} className={`text-right font-mono ${i >= 3 ? "italic" : ""}`}>{formatCurrency(v)}</TableCell>
                        ))}
                        <TableCell className="text-right font-mono">{formatCurrency(grandTotal)}</TableCell>
                      </TableRow>
                    </>
                  );
                })()}
              </TableBody>
            </Table>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-foreground" /> Actual (Jan–Mar)</span>
              <span className="flex items-center gap-1.5 italic"><span className="h-2 w-2 rounded-full bg-muted-foreground" /> Projected (Apr–Jun)</span>
            </div>
          </div>

          {/* Net Profit Summary */}
          {(() => {
            const allP = payments ?? [];
            const allE = expenses ?? [];
            const ytdActualRev = allP.filter((p) => p.payment_year === 2026 && p.payment_month <= 3).reduce((s, p) => s + Number(p.amount), 0);
            const ytdActualExp = allE.filter((e) => e.expense_year === 2026 && e.expense_month <= 3).reduce((s, e) => s + Number(e.amount), 0);
            const projRev = allP.filter((p) => p.payment_year === 2026 && p.payment_month >= 4 && p.payment_month <= 6 && p.notes === "Projected").reduce((s, p) => s + Number(p.amount), 0);
            const projExp = allE.filter((e) => e.expense_year === 2026 && e.expense_month >= 4 && e.expense_month <= 6).reduce((s, e) => s + Number(e.amount), 0);
            const combinedRev = ytdActualRev + projRev;
            const combinedExp = ytdActualExp + projExp;
            const rows = [
              { label: "YTD Actual (Jan–Mar)", rev: ytdActualRev, exp: ytdActualExp },
              { label: "90-Day Projected (Apr–Jun)", rev: projRev, exp: projExp },
              { label: "Combined (Jan–Jun)", rev: combinedRev, exp: combinedExp },
            ];
            return (
              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Net Profit Summary</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Expenses</TableHead>
                      <TableHead className="text-right">Net Profit</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const profit = r.rev - r.exp;
                      const margin = r.rev > 0 ? (profit / r.rev) * 100 : 0;
                      return (
                        <TableRow key={r.label} className={`hover:bg-muted/30 transition-colors ${r.label.includes("Combined") ? "font-bold border-t-2 border-border" : ""}`}>
                          <TableCell>{r.label}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(r.rev)}</TableCell>
                          <TableCell className="text-right font-mono text-destructive">{formatCurrency(r.exp)}</TableCell>
                          <TableCell className={`text-right font-mono ${profit >= 0 ? "text-emerald-500" : "text-destructive"}`}>{formatCurrency(profit)}</TableCell>
                          <TableCell className={`text-right font-mono ${margin >= 0 ? "text-emerald-500" : "text-destructive"}`}>{margin.toFixed(1)}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            );
          })()}
        </CardContent>
      </Card>
      </motion.div>

      {/* Payment History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.8 }}
      >
      <Card className="hover:border-primary/20 transition-colors">
        <CardHeader>
          <CardTitle className="text-lg">Payment History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(payments ?? []).map((p) => {
                  const isProjected = p.notes === "Projected";
                  return (
                    <TableRow key={p.id} className={`hover:bg-muted/30 transition-colors ${isProjected ? "opacity-70" : ""}`}>
                      <TableCell className="font-medium">
                        {(p.clients as { name: string } | null)?.name ?? "Unknown"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {MONTHS[p.payment_month - 1]} {p.payment_year}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isProjected ? "outline" : "default"} className={isProjected ? "border-dashed text-muted-foreground" : ""}>
                          {isProjected ? "Projected" : "Actual"}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-mono ${isProjected ? "italic text-muted-foreground" : ""}`}>
                        {formatCurrency(Number(p.amount))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </motion.div>

      {/* CRUD Dialogs */}
      <ExpenseCrudDialog open={expenseOpen} onOpenChange={setExpenseOpen} editing={editingExpense} />
      <InvestmentCrudDialog open={investmentOpen} onOpenChange={setInvestmentOpen} editing={editingInvestment} />
      <OverheadCrudDialog open={overheadOpen} onOpenChange={setOverheadOpen} editing={editingOverhead} />
    </div>
  );
}
