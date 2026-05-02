import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDown, ArrowUp, Brain, Eye, TrendingDown, AlertTriangle } from "lucide-react";

type Stat = {
  label: string;
  value: string;
  tone: "neutral" | "good" | "bad";
  icon: any;
};

const usd0 = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function DailyPulseStrip() {
  const [stats, setStats] = useState<Stat[] | null>(null);

  useEffect(() => {
    (async () => {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const monthIso = monthStart.toISOString().slice(0, 10);

      const [decisionsRes, profRes, propViewsRes, overdueRes] = await Promise.all([
        supabase
          .from("ai_decision_queue")
          .select("id, risk_tier", { count: "exact" })
          .eq("status", "pending"),
        (supabase as any)
          .from("v_client_profitability")
          .select("profit, margin_pct")
          .eq("month_start", monthIso),
        supabase
          .from("proposals")
          .select("id", { count: "exact", head: true })
          .gte("last_viewed_at", since24h),
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .neq("status", "done")
          .lt("due_date", new Date().toISOString().slice(0, 10))
          .is("archived_at", null),
      ]);

      const decTotal = decisionsRes.count ?? 0;
      const decHigh = (decisionsRes.data ?? []).filter((d: any) => d.risk_tier === "high").length;
      const profRows = (profRes.data ?? []) as { profit: number | null; margin_pct: number | null }[];
      const unprofitable = profRows.filter((r) => Number(r.profit ?? 0) < 0).length;

      setStats([
        {
          label: decTotal === 1 ? "decision pending" : "decisions pending",
          value: String(decTotal),
          tone: decHigh > 0 ? "bad" : decTotal > 0 ? "neutral" : "good",
          icon: Brain,
        },
        {
          label: unprofitable === 1 ? "client unprofitable" : "clients unprofitable",
          value: String(unprofitable),
          tone: unprofitable > 0 ? "bad" : "good",
          icon: TrendingDown,
        },
        {
          label: (propViewsRes.count ?? 0) === 1 ? "proposal opened · 24h" : "proposals opened · 24h",
          value: String(propViewsRes.count ?? 0),
          tone: (propViewsRes.count ?? 0) > 0 ? "good" : "neutral",
          icon: Eye,
        },
        {
          label: (overdueRes.count ?? 0) === 1 ? "overdue task" : "overdue tasks",
          value: String(overdueRes.count ?? 0),
          tone: (overdueRes.count ?? 0) > 0 ? "bad" : "good",
          icon: AlertTriangle,
        },
      ]);
    })();
  }, []);

  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-x-6 gap-y-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Today</span>
        {!stats ? (
          <div className="flex gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-5 w-32" />)}
          </div>
        ) : (
          stats.map((s) => {
            const Icon = s.icon;
            const color =
              s.tone === "bad" ? "text-destructive" :
              s.tone === "good" ? "text-emerald-600" :
              "text-foreground";
            return (
              <div key={s.label} className="flex items-center gap-1.5 text-sm">
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                <span className={`font-mono font-semibold ${color}`}>{s.value}</span>
                <span className="text-muted-foreground">{s.label}</span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}