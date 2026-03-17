import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DollarSign, TrendingUp, TrendingDown, Download, Wallet } from "lucide-react";
import { Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, ComposedChart, Legend } from "recharts";
import { Badge } from "@/components/ui/badge";

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(val);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function AdminFinancials() {
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

  // Monthly revenue & expense chart data
  const monthlyData = MONTHS.map((label, i) => {
    const month = i + 1;
    const revenue = (payments ?? [])
      .filter((p) => p.payment_month === month && p.payment_year === 2026)
      .reduce((s, p) => s + Number(p.amount), 0);
    const expense = (expenses ?? [])
      .filter((e) => e.expense_month === month && e.expense_year === 2026)
      .reduce((s, e) => s + Number(e.amount), 0);
    return { month: label, revenue, expenses: expense, profit: revenue - expense };
  });

  const ytdRevenue = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const ytdExpenses = (expenses ?? [])
    .filter((e) => e.expense_month <= new Date().getMonth() + 1 && e.expense_year === 2026)
    .reduce((s, e) => s + Number(e.amount), 0);
  const ytdProfit = ytdRevenue - ytdExpenses;
  const activeMrr = (clients ?? [])
    .filter((c) => c.status === "active")
    .reduce((s, c) => s + (c.monthly_fee ?? 0), 0);
  const pendingSetup = (clients ?? []).reduce((s, c) => s + (c.balance_due ?? 0), 0);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financial Tracking</h1>
          <p className="text-muted-foreground">Revenue, expenses, profit margins, and investment tracking.</p>
        </div>
        <Button variant="outline" onClick={exportCSV}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">YTD Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold font-mono">{formatCurrency(ytdRevenue)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">YTD Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold font-mono">{formatCurrency(ytdExpenses)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">YTD Profit</CardTitle>
            <DollarSign className={`h-4 w-4 ${ytdProfit >= 0 ? "text-emerald-500" : "text-destructive"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${ytdProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}>
              {formatCurrency(ytdProfit)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Recurring</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold font-mono">{formatCurrency(activeMrr)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Investments</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold font-mono">{formatCurrency(totalInvestments)}</div></CardContent>
        </Card>
      </div>

      {/* Revenue vs Expenses Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Revenue vs Expenses (2026)</CardTitle>
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
                  formatter={(value: number, name: string) => [formatCurrency(value), name.charAt(0).toUpperCase() + name.slice(1)]}
                />
                <Legend />
                <Bar dataKey="revenue" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} name="Revenue" />
                <Bar dataKey="expenses" fill="hsl(0 84% 60%)" radius={[4, 4, 0, 0]} name="Expenses" />
                <Line type="monotone" dataKey="profit" stroke="hsl(225 100% 61%)" strokeWidth={2} name="Profit" dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Expenses Breakdown by Month */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Expense Breakdown by Month</CardTitle>
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
                    <TableRow key={type}>
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
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Owner Investments</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Owner</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(investments ?? []).map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.owner_name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {inv.investment_date ? new Date(inv.investment_date).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{inv.notes ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(inv.amount))}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2 border-border">
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(totalInvestments)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Payment History */}
      <Card>
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
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(payments ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {(p.clients as { name: string } | null)?.name ?? "Unknown"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {MONTHS[p.payment_month - 1]} {p.payment_year}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(p.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
