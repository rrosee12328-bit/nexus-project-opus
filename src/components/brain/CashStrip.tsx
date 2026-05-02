import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Repeat, Receipt, AlertCircle } from "lucide-react";

const usd0 = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function CashStrip() {
  const [data, setData] = useState<{
    mtd: number;
    mrr: number;
    outstanding: number;
    churnRisk: number;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const now = new Date();
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth() + 1;
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const [paymentsRes, clientsRes, invoicesRes, silentClientsRes] = await Promise.all([
        supabase
          .from("client_payments")
          .select("amount")
          .eq("payment_year", y)
          .eq("payment_month", m),
        supabase
          .from("clients")
          .select("monthly_fee, status")
          .eq("status", "active"),
        supabase
          .from("hourly_invoices")
          .select("amount_due, amount_paid, status")
          .in("status", ["open", "sent", "finalized"]),
        // Active clients with no recent message activity (proxy for churn risk)
        supabase
          .from("clients")
          .select("id, last_contact_date")
          .eq("status", "active"),
      ]);

      const mtd = (paymentsRes.data ?? []).reduce(
        (s: number, p: any) => s + Number(p.amount ?? 0),
        0,
      );
      const mrr = (clientsRes.data ?? []).reduce(
        (s: number, c: any) => s + Number(c.monthly_fee ?? 0),
        0,
      );
      const outstanding = (invoicesRes.data ?? []).reduce(
        (s: number, i: any) =>
          s + Math.max(0, Number(i.amount_due ?? 0) - Number(i.amount_paid ?? 0)),
        0,
      );
      // Churn risk: active clients with no contact in >30d
      const cutoff = new Date(Date.now() - 30 * 86400000);
      const churnRisk = (silentClientsRes.data ?? []).filter((c: any) => {
        if (!c.last_contact_date) return true;
        return new Date(c.last_contact_date) < cutoff;
      }).length;

      setData({ mtd, mrr, outstanding, churnRisk });
    })();
  }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-2">
          <DollarSign className="h-3 w-3 text-emerald-500" /> Cash · this month
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!data ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat icon={DollarSign} label="MTD revenue" value={usd0(data.mtd)} tone="success" />
            <Stat icon={Repeat} label="MRR (active)" value={usd0(data.mrr)} tone="info" />
            <Stat
              icon={Receipt}
              label="Outstanding invoices"
              value={usd0(data.outstanding)}
              tone={data.outstanding > 0 ? "warn" : "neutral"}
            />
            <Stat
              icon={AlertCircle}
              label="Churn risk · 30d silent"
              value={String(data.churnRisk)}
              tone={data.churnRisk > 0 ? "danger" : "success"}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  icon: Icon, label, value, tone,
}: { icon: any; label: string; value: string; tone: "success" | "info" | "warn" | "danger" | "neutral" }) {
  const color =
    tone === "success" ? "text-emerald-600" :
    tone === "danger"  ? "text-destructive" :
    tone === "warn"    ? "text-amber-600" :
    tone === "info"    ? "text-primary" :
    "text-foreground";
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className={`h-3 w-3 ${color}`} /> {label}
      </div>
      <p className={`mt-1 font-mono text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
