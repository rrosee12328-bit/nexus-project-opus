import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";

type ProfitRow = {
  client_id: string;
  client_name: string;
  month_start: string;
  revenue: number | null;
  hours: number | null;
  labor_cost: number | null;
  external_cost: number | null;
  profit: number | null;
  margin_pct: number | null;
};

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function ProfitabilityStrip() {
  const [rows, setRows] = useState<ProfitRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const iso = monthStart.toISOString().slice(0, 10);
      const { data, error } = await (supabase as any)
        .from("v_client_profitability")
        .select("*")
        .eq("month_start", iso);
      if (error) console.error(error);
      // Only show clients with any activity this month (revenue or hours)
      const meaningful = ((data ?? []) as ProfitRow[]).filter(
        (r) => Number(r.revenue ?? 0) > 0 || Number(r.hours ?? 0) > 0,
      );
      setRows(meaningful);
      setLoading(false);
    })();
  }, []);

  const sorted = [...rows].sort((a, b) => Number(b.profit ?? 0) - Number(a.profit ?? 0));
  const winners = sorted.slice(0, 3);
  const bleeders = [...sorted].reverse().slice(0, 3).filter((r) => Number(r.profit ?? 0) < Number(winners[winners.length - 1]?.profit ?? 0));

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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Profitability — this month
          </CardTitle>
          {!loading && rows.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                Net {totalProfit >= 0 ? "+" : ""}{usd(totalProfit)}
              </Badge>
              <Badge
                variant="outline"
                className={`font-mono text-xs ${blendedMargin < 20 ? "text-destructive border-destructive/40" : "text-emerald-600 border-emerald-500/40"}`}
              >
                {blendedMargin}% blended
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No client activity this month yet. Once payments or hours are logged, profitability appears here.
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
        )}
      </CardContent>
    </Card>
  );
}