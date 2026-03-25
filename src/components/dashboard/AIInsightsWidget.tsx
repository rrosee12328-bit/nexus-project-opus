import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, TrendingUp, TrendingDown, AlertTriangle, Rocket, BarChart3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface Insight {
  title: string;
  body: string;
  type: "revenue" | "risk" | "progress" | "productivity";
  trend: "up" | "down" | "neutral";
  metric?: string;
}

const TYPE_CONFIG: Record<string, { icon: typeof TrendingUp; color: string; bg: string }> = {
  revenue: { icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  risk: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10 border-warning/20" },
  progress: { icon: Rocket, color: "text-primary", bg: "bg-primary/10 border-primary/20" },
  productivity: { icon: BarChart3, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
};

export function AIInsightsWidget() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["ai-dashboard-insights"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-insights");
      if (error) throw error;
      return data?.insights as Insight[] ?? [];
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 min
    refetchOnWindowFocus: false,
  });

  return (
    <Card className="border-primary/10 bg-gradient-to-br from-card to-primary/[0.02]">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Brain className="h-4 w-4 text-primary" />
          </div>
          AI Insights
          <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20 font-normal">
            Live
          </Badge>
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <AnimatePresence mode="wait">
              {(data ?? []).map((insight, i) => {
                const config = TYPE_CONFIG[insight.type] ?? TYPE_CONFIG.progress;
                const Icon = config.icon;
                const TrendIcon = insight.trend === "up" ? TrendingUp : insight.trend === "down" ? TrendingDown : BarChart3;

                return (
                  <motion.div
                    key={insight.title}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: i * 0.08 }}
                    className={`rounded-lg border p-3 ${config.bg} transition-all hover:scale-[1.02]`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                        <span className="text-xs font-semibold">{insight.title}</span>
                      </div>
                      <TrendIcon className={`h-3 w-3 shrink-0 ${
                        insight.trend === "up" ? "text-emerald-400" :
                        insight.trend === "down" ? "text-destructive" :
                        "text-muted-foreground"
                      }`} />
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{insight.body}</p>
                    {insight.metric && (
                      <div className="mt-2 text-sm font-bold font-mono">{insight.metric}</div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
