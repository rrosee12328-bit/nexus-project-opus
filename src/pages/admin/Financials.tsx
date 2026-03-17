import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DollarSign, TrendingUp, TrendingDown, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

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

  // Monthly revenue chart data
  const monthlyRevenue = MONTHS.map((label, i) => {
    const month = i + 1;
    const total = (payments ?? [])
      .filter((p) => p.payment_month === month && p.payment_year === 2026)
      .reduce((s, p) => s + Number(p.amount), 0);
    return { month: label, revenue: total };
  });

  const ytdRevenue = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const activeMrr = (clients ?? [])
    .filter((c) => c.status === "active")
    .reduce((s, c) => s + (c.monthly_fee ?? 0), 0);
  const pendingSetup = (clients ?? []).reduce((s, c) => s + (c.balance_due ?? 0), 0);

  // Expenses (hardcoded from spreadsheet for now)
  const expenses = [
    { type: "Operating Expenses", monthly: 651 },
    { type: "Ricky (Co-Founder) Salary", monthly: 4000 },
    { type: "Outsourced Editing", monthly: 1200 },
    { type: "Office Rent (starting Apr)", monthly: 625 },
  ];
  const totalMonthlyExpenses = expenses.reduce((s, e) => s + e.monthly, 0);

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
          <p className="text-muted-foreground">Revenue, expenses, and payment history.</p>
        </div>
        <Button variant="outline" onClick={exportCSV}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">YTD Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold font-mono">{formatCurrency(ytdRevenue)}</div></CardContent>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold font-mono">{formatCurrency(totalMonthlyExpenses)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Setup</CardTitle>
            <DollarSign className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold font-mono text-warning">{formatCurrency(pendingSetup)}</div></CardContent>
        </Card>
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Monthly Revenue (2026)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 18%)" />
                <XAxis dataKey="month" stroke="hsl(0 0% 55%)" fontSize={12} />
                <YAxis stroke="hsl(0 0% 55%)" fontSize={12} tickFormatter={(v) => `$${v / 1000}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(0 0% 10%)", border: "1px solid hsl(0 0% 18%)", borderRadius: "6px" }}
                  labelStyle={{ color: "hsl(0 0% 100%)" }}
                  formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                />
                <Bar dataKey="revenue" fill="hsl(225 100% 61%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Monthly Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Expense Type</TableHead>
                <TableHead className="text-right">Monthly Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((e) => (
                <TableRow key={e.type}>
                  <TableCell>{e.type}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(e.monthly)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-bold border-t-2 border-border">
                <TableCell>Total</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(totalMonthlyExpenses)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
