import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Scale, TrendingDown, TrendingUp } from "lucide-react";

type Range = "mtd" | "30d" | "90d" | "ytd";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function rangeStartIso(r: Range): string {
  const d = new Date();
  if (r === "mtd") {
    d.setUTCDate(1);
  } else if (r === "30d") {
    d.setUTCDate(d.getUTCDate() - 30);
    d.setUTCDate(1);
  } else if (r === "90d") {
    d.setUTCDate(d.getUTCDate() - 90);
    d.setUTCDate(1);
  } else {
    d.setUTCMonth(0, 1);
  }
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function ChargeVsCostCard({ clientId }: { clientId: string }) {
  const [range, setRange] = useState<Range>("mtd");
  const [loading, setLoading] = useState(true);
  const [hourlyCost, setHourlyCost] = useState<number>(125);
  const [revenue, setRevenue] = useState(0);
  const [hours, setHours] = useState(0);
  const [externalCost, setExternalCost] = useState(0);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const start = rangeStartIso(range);
      const [{ data: settings }, { data: rows }] = await Promise.all([
        supabase.from("business_settings").select("internal_hourly_cost").limit(1).maybeSingle(),
        (supabase as any)
          .from("v_client_profitability")
          .select("revenue,hours,external_cost,month_start")
          .eq("client_id", clientId)
          .gte("month_start", start),
      ]);
      const rate = Number(settings?.internal_hourly_cost ?? 125);
      setHourlyCost(rate);
      const r = (rows ?? []) as any[];
      setRevenue(r.reduce((s, x) => s + Number(x.revenue ?? 0), 0));
      setHours(r.reduce((s, x) => s + Number(x.hours ?? 0), 0));
      setExternalCost(r.reduce((s, x) => s + Number(x.external_cost ?? 0), 0));
      setLoading(false);
    })();
  }, [clientId, range]);

  const laborCost = hours * hourlyCost;
  const totalCost = laborCost + externalCost;
  const profit = revenue - totalCost;
  const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : null;
  const profitable = profit >= 0;

  const rangeLabel =
    range === "mtd" ? "month to date"
    : range === "30d" ? "last 30 days"
    : range === "90d" ? "last 90 days"
    : "year to date";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            Charge vs Cost — {rangeLabel}
          </CardTitle>
          <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
            <TabsList className="h-8">
              <TabsTrigger value="mtd" className="text-xs">MTD</TabsTrigger>
              <TabsTrigger value="30d" className="text-xs">30d</TabsTrigger>
              <TabsTrigger value="90d" className="text-xs">90d</TabsTrigger>
              <TabsTrigger value="ytd" className="text-xs">YTD</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Charged" value={usd(revenue)} hint="Payments received" />
              <Stat
                label="Time spent"
                value={`${hours.toFixed(1)}h`}
                hint={`@ ${usd(hourlyCost)}/h`}
              />
              <Stat label="Labor cost" value={usd(laborCost)} hint={`${hours.toFixed(1)}h × ${usd(hourlyCost)}`} />
              <Stat
                label={profitable ? "Profit" : "Loss"}
                value={`${profit >= 0 ? "+" : ""}${usd(profit)}`}
                hint={margin !== null ? `${margin}% margin` : "no revenue"}
                tone={profitable ? "good" : "bad"}
              />
            </div>
            {externalCost > 0 && (
              <p className="text-xs text-muted-foreground font-mono">
                Includes {usd(externalCost)} external/monthly costs
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <Badge
                variant="outline"
                className={`font-mono text-xs ${profitable ? "text-emerald-600 border-emerald-500/40" : "text-destructive border-destructive/40"}`}
              >
                {profitable ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                {profitable ? "Profitable" : "Underwater"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Effective rate:{" "}
                <span className="font-mono">
                  {hours > 0 ? usd(revenue / hours) + "/h" : "—"}
                </span>
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={`text-lg font-semibold font-mono tabular-nums ${
          tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{hint}</p>}
    </div>
  );
}