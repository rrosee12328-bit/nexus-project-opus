import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDown, ArrowUp, Minus, Brain, Eye, TrendingDown, AlertTriangle } from "lucide-react";

type Stat = {
  label: string;
  value: number;
  prev: number;
  tone: "neutral" | "good" | "bad";
  invertTrend?: boolean;
  icon: any;
};

export function DailyPulseStrip({ embedded = false }: { embedded?: boolean } = {}) {
  const [stats, setStats] = useState<Stat[] | null>(null);

  useEffect(() => {
    (async () => {
      const today = new Date();
      const todayIso = today.toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000);
      const yesterdayIso = yesterday.toISOString().slice(0, 10);
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const monthIso = monthStart.toISOString().slice(0, 10);

      const [
        decisionsNow, decisionsPrev,
        profRes,
        propViews24, propViewsPrev,
        overdueNow, overduePrev,
      ] = await Promise.all([
        supabase.from("ai_decision_queue").select("id, risk_tier", { count: "exact" }).eq("status", "pending"),
        supabase.from("ai_decision_queue").select("id", { count: "exact", head: true })
          .eq("status", "pending").lt("created_at", new Date(Date.now() - 86400000).toISOString()),
        (supabase as any).from("v_client_profitability").select("profit").eq("month_start", monthIso),
        supabase.from("proposals").select("id", { count: "exact", head: true }).gte("last_viewed_at", since24h),
        supabase.from("proposals").select("id", { count: "exact", head: true })
          .gte("last_viewed_at", since48h).lt("last_viewed_at", since24h),
        supabase.from("tasks").select("id", { count: "exact", head: true })
          .neq("status", "done").lt("due_date", todayIso).is("archived_at", null),
        supabase.from("tasks").select("id", { count: "exact", head: true })
          .neq("status", "done").lt("due_date", yesterdayIso).is("archived_at", null),
      ]);

      const decTotal = decisionsNow.count ?? 0;
      const decHigh = (decisionsNow.data ?? []).filter((d: any) => d.risk_tier === "high").length;
      const profRows = (profRes.data ?? []) as { profit: number | null }[];
      const unprofitable = profRows.filter((r) => Number(r.profit ?? 0) < 0).length;

      setStats([
        {
          label: decTotal === 1 ? "decision pending" : "decisions pending",
          value: decTotal,
          prev: decisionsPrev.count ?? 0,
          tone: decHigh > 0 ? "bad" : decTotal > 0 ? "neutral" : "good",
          invertTrend: true,
          icon: Brain,
        },
        {
          label: unprofitable === 1 ? "client unprofitable" : "clients unprofitable",
          value: unprofitable,
          prev: unprofitable, // no historical view; hide trend
          tone: unprofitable > 0 ? "bad" : "good",
          invertTrend: true,
          icon: TrendingDown,
        },
        {
          label: (propViews24.count ?? 0) === 1 ? "proposal opened · 24h" : "proposals opened · 24h",
          value: propViews24.count ?? 0,
          prev: propViewsPrev.count ?? 0,
          tone: (propViews24.count ?? 0) > 0 ? "good" : "neutral",
          icon: Eye,
        },
        {
          label: (overdueNow.count ?? 0) === 1 ? "overdue task" : "overdue tasks",
          value: overdueNow.count ?? 0,
          prev: overduePrev.count ?? 0,
          tone: (overdueNow.count ?? 0) > 0 ? "bad" : "good",
          invertTrend: true,
          icon: AlertTriangle,
        },
      ]);
    })();
  }, []);

  const body = (
    <div className="flex items-center gap-x-6 gap-y-2 flex-wrap">
      {!embedded && (
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Today</span>
      )}
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
            const delta = s.value - s.prev;
            const showTrend = s.value !== s.prev;
            const goodTrend = s.invertTrend ? delta < 0 : delta > 0;
            const TrendIcon = delta === 0 ? Minus : delta > 0 ? ArrowUp : ArrowDown;
            const trendColor = delta === 0 ? "text-muted-foreground" : goodTrend ? "text-emerald-600" : "text-destructive";
            return (
              <div key={s.label} className="flex items-center gap-1.5 text-sm">
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                <span className={`font-mono font-semibold ${color}`}>{s.value}</span>
                <span className="text-muted-foreground">{s.label}</span>
                {showTrend && (
                  <span className={`flex items-center gap-0.5 text-[10px] font-mono ${trendColor}`} title="vs yesterday">
                    <TrendIcon className="h-2.5 w-2.5" />{Math.abs(delta)}
                  </span>
                )}
              </div>
            );
          })
        )}
    </div>
  );
  if (embedded) return body;
  return (
    <Card>
      <CardContent className="p-3">{body}</CardContent>
    </Card>
  );
}
