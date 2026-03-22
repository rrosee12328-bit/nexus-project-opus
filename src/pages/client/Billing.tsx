import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Receipt, Download, CreditCard, Calendar, DollarSign,
  ExternalLink, RefreshCw, AlertCircle, CheckCircle2, Clock,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const fmt = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });

const fmtDollars = (val: number) =>
  val.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 16 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.45, delay },
});

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }> = {
  paid: { label: "Paid", variant: "default", icon: CheckCircle2 },
  open: { label: "Open", variant: "secondary", icon: Clock },
  draft: { label: "Draft", variant: "outline", icon: Clock },
  void: { label: "Void", variant: "outline", icon: AlertCircle },
  uncollectible: { label: "Uncollectible", variant: "destructive", icon: AlertCircle },
  past_due: { label: "Past Due", variant: "destructive", icon: AlertCircle },
};

export default function ClientBilling() {
  const { user } = useAuth();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Get client ID
  const { data: clientId } = useQuery({
    queryKey: ["my-client-id", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_client_id_for_user", { _user_id: user!.id });
      if (error) throw error;
      return data as string | null;
    },
    enabled: !!user?.id,
  });

  // Get client record (for stripe_customer_id check)
  const { data: clientRecord } = useQuery({
    queryKey: ["my-client-record", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, stripe_customer_id, monthly_fee")
        .eq("id", clientId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  // Stripe invoices
  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ["stripe-invoices", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stripe_invoices")
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  // Stripe subscriptions
  const { data: subscriptions } = useQuery({
    queryKey: ["stripe-subscriptions", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stripe_subscriptions")
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  // Legacy payments (manual)
  const { data: legacyPayments } = useQuery({
    queryKey: ["legacy-payments", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_payments")
        .select("*")
        .order("payment_year", { ascending: false })
        .order("payment_month", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((p: any) => p.notes !== "Projected" && (!p.payment_source || p.payment_source === "manual"));
    },
    enabled: !!clientId,
  });

  const activeSub = subscriptions?.find((s: any) => s.status === "active" || s.status === "trialing");
  const outstandingBalance = (invoices ?? [])
    .filter((inv: any) => inv.status === "open" || inv.status === "past_due")
    .reduce((sum: number, inv: any) => sum + (inv.amount_due - inv.amount_paid), 0);

  const nextPaymentDate = activeSub?.current_period_end
    ? new Date(activeSub.current_period_end).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      })
    : null;

  const hasStripe = !!clientRecord?.stripe_customer_id;

  const handleManagePayment = async () => {
    if (!clientId) return;
    setLoadingAction("portal");
    try {
      const { data, error } = await supabase.functions.invoke("stripe-portal", {
        body: { client_id: clientId },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err: any) {
      toast.error(err.message || "Failed to open billing portal");
    } finally {
      setLoadingAction(null);
    }
  };

  const handlePayInvoice = (hostedUrl: string) => {
    window.open(hostedUrl, "_blank");
  };

  if (invoicesLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading billing…</p>
        </div>
      </div>
    );
  }

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div {...anim(0)} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
          <p className="text-muted-foreground mt-1">
            View invoices, manage your payment method, and track your billing history.
          </p>
        </div>
        {hasStripe && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleManagePayment}
            disabled={loadingAction === "portal"}
            className="gap-2 shrink-0"
          >
            {loadingAction === "portal" ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            Manage Payment Method
          </Button>
        )}
      </motion.div>

      {/* Overview Cards */}
      <motion.div {...anim(0.05)} className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Current Plan */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Subscription</p>
                <p className="text-lg font-semibold">
                  {activeSub ? (
                    <Badge variant="default" className="text-sm">Active</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-sm">No subscription</Badge>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Outstanding Balance */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Outstanding</p>
                <p className="text-lg font-semibold">
                  {outstandingBalance > 0 ? fmt(outstandingBalance) : "$0.00"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Next Payment */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Next Payment</p>
                <p className="text-lg font-semibold">
                  {nextPaymentDate || "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Autopay */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <RefreshCw className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Autopay</p>
                <p className="text-lg font-semibold">
                  {activeSub ? (
                    <Badge variant="default" className="text-sm">On</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-sm">Off</Badge>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Subscription Details */}
      {activeSub && (
        <motion.div {...anim(0.1)}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Active Subscription
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Status: </span>
                  <Badge variant="default">{activeSub.status}</Badge>
                </div>
                {activeSub.current_period_end && (
                  <div>
                    <span className="text-muted-foreground">Renews: </span>
                    <span className="font-medium">
                      {new Date(activeSub.current_period_end).toLocaleDateString("en-US", {
                        month: "long", day: "numeric", year: "numeric",
                      })}
                    </span>
                  </div>
                )}
                {activeSub.cancel_at_period_end && (
                  <Badge variant="destructive">Cancels at end of period</Badge>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={handleManagePayment} className="gap-2">
                <ExternalLink className="h-4 w-4" /> Manage Subscription
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Stripe Invoice History */}
      {(invoices ?? []).length > 0 && (
        <motion.div {...anim(0.15)}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                Invoices
                <Badge variant="secondary" className="ml-2 font-mono text-xs">
                  {invoices!.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices!.map((inv: any) => {
                    const cfg = statusConfig[inv.status] || statusConfig.draft;
                    const StatusIcon = cfg.icon;
                    return (
                      <TableRow key={inv.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-medium font-mono text-sm">
                          {inv.stripe_invoice_number || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(inv.created_at).toLocaleDateString("en-US", {
                            month: "short", day: "numeric", year: "numeric",
                          })}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono font-semibold">
                            {fmt(inv.amount_due)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={cfg.variant} className="gap-1">
                            <StatusIcon className="h-3 w-3" />
                            {cfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          {(inv.status === "open" || inv.status === "past_due") && inv.hosted_invoice_url && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handlePayInvoice(inv.hosted_invoice_url)}
                              className="gap-1"
                            >
                              <DollarSign className="h-3 w-3" /> Pay
                            </Button>
                          )}
                          {inv.status === "paid" && inv.invoice_pdf && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(inv.invoice_pdf, "_blank")}
                              className="gap-1"
                            >
                              <Download className="h-3 w-3" /> Receipt
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Legacy Manual Payments */}
      {(legacyPayments ?? []).length > 0 && (
        <motion.div {...anim(0.2)}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="h-5 w-5 text-muted-foreground" />
                Payment History
                <Badge variant="outline" className="ml-2 font-mono text-xs">
                  {legacyPayments!.length}
                </Badge>
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
                  {legacyPayments!.map((payment: any) => (
                    <TableRow key={payment.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">
                        {MONTH_NAMES[payment.payment_month - 1]} {payment.payment_year}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono font-semibold">
                          {fmtDollars(Number(payment.amount))}
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
      )}

      {/* Empty state */}
      {(invoices ?? []).length === 0 && (legacyPayments ?? []).length === 0 && (
        <motion.div {...anim(0.1)}>
          <Card className="border-dashed border-2 border-border">
            <CardContent className="py-16 flex flex-col items-center text-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Receipt className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">No billing activity yet</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Your invoices and payment history will appear here once billing begins.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
