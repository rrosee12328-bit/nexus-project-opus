import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";

type ProfitRow = {
  client_id: string;
  client_name: string;
  month_start: string;
  revenue: number | null;
  hours: number | null;
  profit: number | null;
  margin_pct: number | null;
};

type Range = "30d" | "90d" | "ytd";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function rangeStartIso(r: Range): string {
  const d = new Date();
  if (r === "30d") d.setUTCDate(d.getUTCDate() - 30);
  else if (r === "90d") d.setUTCDate(d.getUTCDate() - 90);
  else { d.setUTCMonth(0, 1); d.setUTCHours(0, 0, 0, 0); }
  // Normalize to month_start
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function ProfitabilityStrip({ embedded = false }: { embedded?: boolean } = {}) {
  const [range, setRange] = useState<Range>("30d");
  const [rows, setRows] = useState<ProfitRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const start = rangeStartIso(range);
      const { data, error } = await (supabase as any)
        .from("v_client_profitability")
        .select("*")
        .gte("month_start", start);
      if (error) console.error(error);
      // Aggregate by client across months in range
      const map = new Map<string, ProfitRow>();
      for (const r of (data ?? []) as ProfitRow[]) {
        const cur = map.get(r.client_id);
        if (!cur) {
          map.set(r.client_id, { ...r });
        } else {
          cur.revenue = Number(cur.revenue ?? 0) + Number(r.revenue ?? 0);
          cur.hours = Number(cur.hours ?? 0) + Number(r.hours ?? 0);
          cur.profit = Number(cur.profit ?? 0) + Number(r.profit ?? 0);
        }
      }
      const merged = Array.from(map.values()).map((r) => ({
        ...r,
        margin_pct: Number(r.revenue ?? 0) > 0
          ? (Number(r.profit ?? 0) / Number(r.revenue ?? 0)) * 100
          : null,
      }));
      const meaningful = merged.filter(
        (r) => Number(r.revenue ?? 0) > 0 || Number(r.hours ?? 0) > 0,
      );
      setRows(meaningful);
      setLoading(false);
    })();
  }, [range]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => Number(b.profit ?? 0) - Number(a.profit ?? 0)),
    [rows],
  );
  const winners = sorted.slice(0, 3);
  const bleeders = [...sorted].reverse().slice(0, 3).filter(
    (r) => Number(r.profit ?? 0) < Number(winners[winners.length - 1]?.profit ?? 0),
  );

  const totalProfit = rows.reduce((s, r) => s + Number(r.profit ?? 0), 0);
  const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const blendedMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;

  const RowItem = ({ r, kind }: { r: ProfitRow; kind: "win" | "lose" }) => {
    const profit = Number(r.profit ?? 0);
    const margin = r.margin_pct == null ? null : Math.round(Number(r.margin_pct));
    return (
      <Link
        to={`/admin/clients/${r.client_id}`}
        className="flex items-center justify-between gap-3 rounded-md border bg-card p-2.5 hover:border-primary/40 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{r.client_name}</p>
          <p className="text-[11px] text-muted-foreground font-mono">
            {usd(Number(r.revenue ?? 0))} rev · {Number(r.hours ?? 0).toFixed(1)}h
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-mono font-semibold ${kind === "win" ? "text-emerald-600" : "text-destructive"}`}>
            {profit >= 0 ? "+" : ""}{usd(profit)}
          </p>
          {margin !== null && (
            <p className="text-[11px] text-muted-foreground font-mono">{margin}% margin</p>
          )}
        </div>
      </Link>
    );
  };

  const rangeLabel = range === "30d" ? "last 30 days" : range === "90d" ? "last 90 days" : "year to date";

  const body = loading ? (
    <div className="grid sm:grid-cols-2 gap-3">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
    </div>
  ) : rows.length === 0 ? (
    <p className="text-sm text-muted-foreground py-2">
      No client activity in this range yet.
    </p>
  ) : (
    <div className="grid sm:grid-cols-2 gap-4">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <TrendingUp className="h-3 w-3 text-emerald-600" /> Top winners
        </p>
        <div className="space-y-1.5">
          {winners.map((r) => <RowItem key={r.client_id} r={r} kind="win" />)}
        </div>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <TrendingDown className="h-3 w-3 text-destructive" /> Biggest bleeders
        </p>
        <div className="space-y-1.5">
          {bleeders.length > 0 ? (
            bleeders.map((r) => <RowItem key={r.client_id} r={r} kind="lose" />)
          ) : (
            <p className="text-xs text-muted-foreground italic px-1">All clients profitable. Nice.</p>
          )}
        </div>
      </div>
    </div>
  );

  const controls = (
    <div className="flex items-center gap-2 flex-wrap">
      <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
        <TabsList className="h-8">
          <TabsTrigger value="30d" className="text-xs">30d</TabsTrigger>
          <TabsTrigger value="90d" className="text-xs">90d</TabsTrigger>
          <TabsTrigger value="ytd" className="text-xs">YTD</TabsTrigger>
        </TabsList>
      </Tabs>
      {!loading && rows.length > 0 && (
        <>
          <Badge variant="outline" className="font-mono text-xs">
            Net {totalProfit >= 0 ? "+" : ""}{usd(totalProfit)}
          </Badge>
          <Badge
            variant="outline"
            className={`font-mono text-xs ${blendedMargin < 20 ? "text-destructive border-destructive/40" : "text-emerald-600 border-emerald-500/40"}`}
          >
            {blendedMargin}% blended
          </Badge>
        </>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{rangeLabel}</p>
          {controls}
        </div>
        {body}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Profitability — {rangeLabel}
          </CardTitle>
          {controls}
        </div>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
