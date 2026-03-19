import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DollarSign, TrendingUp, Calendar, Receipt, Download } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function ClientPayments() {
  const { user } = useAuth();

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

  const totalPaid = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const currentYear = new Date().getFullYear();
  const thisYearPayments = (payments ?? []).filter((p) => p.payment_year === currentYear);
  const thisYearTotal = thisYearPayments.reduce((sum, p) => sum + Number(p.amount), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const exportCSV = () => {
    if (!payments?.length) return;
    const rows = [
      ["Period", "Amount", "Notes", "Date Recorded"],
      ...payments.map((p) => [
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment History</h1>
          <p className="text-muted-foreground mt-1">
            View all your payments and billing history with Vektiss.
          </p>
        </div>
        {(payments ?? []).length > 0 && (
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2 shrink-0">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        )}
      </motion.div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: DollarSign, label: "Total Paid", value: `$${totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}` },
          { icon: TrendingUp, label: `${currentYear} Total`, value: `$${thisYearTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}` },
          { icon: Calendar, label: "Payments Made", value: String((payments ?? []).length) },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.07 }}
          >
            <Card className="border-border hover:border-primary/20 transition-colors">
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <card.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-2xl font-bold tracking-tight font-mono">{card.value}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Payment table */}
      {(payments ?? []).length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                All Payments
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
                  {payments!.map((payment) => (
                    <TableRow key={payment.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">
                        {MONTH_NAMES[payment.payment_month - 1]} {payment.payment_year}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono font-semibold">
                          ${Number(payment.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                        {payment.notes || "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {new Date(payment.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
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
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
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
