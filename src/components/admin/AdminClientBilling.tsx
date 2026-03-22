import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CreditCard, DollarSign, ExternalLink, Receipt, RefreshCw,
  CheckCircle2, Clock, AlertCircle, Send, Zap,
} from "lucide-react";
import { toast } from "sonner";

const fmt = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const statusCfg: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }> = {
  paid: { label: "Paid", variant: "default", icon: CheckCircle2 },
  open: { label: "Open", variant: "secondary", icon: Clock },
  draft: { label: "Draft", variant: "outline", icon: Clock },
  void: { label: "Void", variant: "outline", icon: AlertCircle },
  uncollectible: { label: "Uncollectible", variant: "destructive", icon: AlertCircle },
};

interface Props {
  clientId: string;
  clientName: string;
  stripeCustomerId: string | null;
}

export default function AdminClientBilling({ clientId, clientName, stripeCustomerId }: Props) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const { data: invoices } = useQuery({
    queryKey: ["admin-stripe-invoices", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stripe_invoices")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  const { data: subscriptions } = useQuery({
    queryKey: ["admin-stripe-subs", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stripe_subscriptions")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  const activeSub = subscriptions?.find((s: any) => s.status === "active" || s.status === "trialing");
  const outstandingBalance = (invoices ?? [])
    .filter((inv: any) => inv.status === "open")
    .reduce((sum: number, inv: any) => sum + (inv.amount_due - inv.amount_paid), 0);

  const handleCreateCheckout = async (mode: "payment" | "subscription") => {
    setLoadingAction("checkout");
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          client_id: clientId,
          mode,
          amount: mode === "payment" ? 100 : undefined, // placeholder — admin should set amount
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
        toast.success("Checkout opened in new tab");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create payment link");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleOpenPortal = async () => {
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Billing
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {stripeCustomerId && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenPortal}
                disabled={loadingAction === "portal"}
                className="gap-1"
              >
                {loadingAction === "portal" ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
                Stripe Portal
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCreateCheckout("payment")}
              disabled={loadingAction === "checkout"}
              className="gap-1"
            >
              {loadingAction === "checkout" ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Payment Link
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick summary row */}
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Subscription:</span>
            {activeSub ? (
              <Badge variant="default">Active</Badge>
            ) : (
              <Badge variant="secondary">None</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Outstanding:</span>
            <span className="font-semibold font-mono">
              {outstandingBalance > 0 ? fmt(outstandingBalance) : "$0.00"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Stripe:</span>
            {stripeCustomerId ? (
              <Badge variant="outline" className="font-mono text-xs">{stripeCustomerId.slice(0, 18)}…</Badge>
            ) : (
              <Badge variant="secondary">Not linked</Badge>
            )}
          </div>
        </div>

        {/* Recent invoices */}
        {(invoices ?? []).length > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Recent Invoices
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices!.slice(0, 5).map((inv: any) => {
                  const cfg = statusCfg[inv.status] || statusCfg.draft;
                  const StatusIcon = cfg.icon;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">
                        {inv.stripe_invoice_number || "—"}
                      </TableCell>
                      <TableCell className="font-mono font-semibold">
                        {fmt(inv.amount_due)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant} className="gap-1 text-xs">
                          <StatusIcon className="h-3 w-3" /> {cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {new Date(inv.created_at).toLocaleDateString("en-US", {
                          month: "short", day: "numeric",
                        })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
            <Receipt className="h-5 w-5" />
            <span>No Stripe invoices yet. Send a payment link to get started.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
