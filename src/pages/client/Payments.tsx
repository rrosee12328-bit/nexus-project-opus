import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Calendar, Receipt, Download, DollarSign, TrendingUp, CreditCard } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmt = (val: number) =>
  val.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 16 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.45, delay },
});

export default function ClientPayments() {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [filterYear, setFilterYear] = useState<string>("all");

  const { data: payments, isLoading } = useQuery({
    queryKey: ["client-payments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_payments")
        .select("*")
        .order("payment_year", { ascending: false })
        .order("payment_month", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading payments…</p>
        </div>
      </div>
    );
  }

  const allPayments = payments ?? [];
  const years = [...new Set(allPayments.map((p) => p.payment_year))].sort((a, b) => b - a);
  const filtered = filterYear === "all" ? allPayments : allPayments.filter((p) => p.payment_year === Number(filterYear));

  const totalPaid = filtered.reduce((s, p) => s + Number(p.amount), 0);
  const avgPayment = filtered.length ? totalPaid / filtered.length : 0;
  const ytdPayments = allPayments.filter((p) => p.payment_year === currentYear);
  const ytdTotal = ytdPayments.reduce((s, p) => s + Number(p.amount), 0);

  // Chart data — monthly for the selected year (or current year)
  const chartYear = filterYear === "all" ? currentYear : Number(filterYear);
  const chartPayments = allPayments.filter((p) => p.payment_year === chartYear);
  const chartData = MONTH_SHORT.map((month, i) => {
    const monthPayments = chartPayments.filter((p) => p.payment_month === i + 1);
    return { month, amount: monthPayments.reduce((s, p) => s + Number(p.amount), 0) };
  }).filter((_, i) => i < (chartYear === currentYear ? new Date().getMonth() + 1 : 12));

  const exportCSV = () => {
    if (!filtered.length) return;
    const rows = [
      ["Period", "Amount", "Notes", "Date Recorded"],
      ...filtered.map((p) => [
        `${MONTH_NAMES[p.payment_month - 1]} ${p.payment_year}`,
        Number(p.amount).toFixed(2),
        p.notes || "",
        new Date(p.created_at).toLocaleDateString(),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vektiss-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = [
    { label: "Total Paid", value: fmt(totalPaid), icon: DollarSign, color: "text-primary" },
    { label: "Payments Made", value: filtered.length.toString(), icon: CreditCard, color: "text-primary" },
    { label: "Avg Payment", value: fmt(avgPayment), icon: TrendingUp, color: "text-success" },
    { label: `YTD ${currentYear}`, value: fmt(ytdTotal), icon: Calendar, color: "text-primary" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div {...anim(0)} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment History</h1>
          <p className="text-muted-foreground mt-1">
            View all your payments and billing history with Vektiss.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {years.length > 1 && (
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {filtered.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2 shrink-0">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          )}
        </div>
      </motion.div>

      {/* Summary stats */}
      {allPayments.length > 0 && (
        <motion.div {...anim(0.08)} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map((stat) => (
            <Card key={stat.label} className="border-border hover:border-primary/20 transition-colors">
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="font-mono font-bold text-lg leading-none">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      )}

      {/* Payment chart */}
      {chartData.some((d) => d.amount > 0) && (
        <motion.div {...anim(0.16)}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Monthly Payments — {chartYear}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      formatter={(value: number) => [fmt(value), "Amount"]}
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Payment table */}
      {filtered.length > 0 ? (
        <motion.div {...anim(0.24)}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                All Payments
                <Badge variant="secondary" className="ml-2 font-mono text-xs">{filtered.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Notes</TableHead>
                    <TableHead className="text-right">Date Recorded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((payment) => (
                    <TableRow key={payment.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">
                        {MONTH_NAMES[payment.payment_month - 1]} {payment.payment_year}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono font-semibold">
                          {fmt(Number(payment.amount))}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                        {payment.notes || "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {new Date(payment.created_at).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <motion.div {...anim(0.2)}>
          <Card className="border-dashed border-2 border-border">
            <CardContent className="py-16 flex flex-col items-center text-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Receipt className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">No payments yet</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Your payment history will appear here once billing begins.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
