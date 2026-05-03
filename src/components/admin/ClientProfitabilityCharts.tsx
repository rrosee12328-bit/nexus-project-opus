import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from "recharts";
import { TrendingUp } from "lucide-react";

type Row = {
  client_id: string;
  client_name: string;
  month_start: string;
  revenue: number | null;
  hours: number | null;
  labor_cost: number | null;
  external_cost: number | null;
  profit: number | null;
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

type Mode = "ytd" | "year";

export function ClientProfitabilityCharts() {
  const currentYear = new Date().getUTCFullYear();
  const [mode, setMode] = useState<Mode>("ytd");
  const [year, setYear] = useState<number>(currentYear);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["client-profitability-all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_client_profitability")
        .select("client_id, client_name, month_start, revenue, hours, labor_cost, external_cost, profit")
        .order("month_start");
      if (error) throw error;
      return data as Row[];
    },
  });

  const years = useMemo(() => {
    const set = new Set<number>([currentYear]);
    (rows ?? []).forEach((r) => set.add(new Date(r.month_start + "T00:00:00Z").getUTCFullYear()));
    return Array.from(set).sort((a, b) => b - a);
  }, [rows, currentYear]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const now = new Date();
    return rows.filter((r) => {
      const d = new Date(r.month_start + "T00:00:00Z");
      if (mode === "ytd") {
        return d.getUTCFullYear() === currentYear &&
          d <= now;
      }
      return d.getUTCFullYear() === year;
    });
  }, [rows, mode, year, currentYear]);

  const byClient = useMemo(() => {
    const map = new Map<string, { name: string; rows: Row[] }>();
    filtered.forEach((r) => {
      const cur = map.get(r.client_id) ?? { name: r.client_name, rows: [] };
      cur.rows.push(r);
      map.set(r.client_id, cur);
    });
    // sort by revenue desc
    return Array.from(map.entries())
      .map(([id, v]) => ({
        id,
        name: v.name,
        rows: v.rows,
        totalRevenue: v.rows.reduce((s, r) => s + Number(r.revenue ?? 0), 0),
        totalCost: v.rows.reduce((s, r) => s + Number(r.labor_cost ?? 0) + Number(r.external_cost ?? 0), 0),
        totalHours: v.rows.reduce((s, r) => s + Number(r.hours ?? 0), 0),
      }))
      .filter((c) => c.totalRevenue > 0 || c.totalHours > 0)
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [filtered]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Profitability Trends — Charge vs Cost & Hours
          </CardTitle>
          <div className="flex items-center gap-2">
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList className="h-8">
                <TabsTrigger value="ytd" className="text-xs">YTD</TabsTrigger>
                <TabsTrigger value="year" className="text-xs">Year</TabsTrigger>
              </TabsList>
            </Tabs>
            {mode === "year" && (
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="h-8 w-[100px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : byClient.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No profitability data for this period yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {byClient.map((c) => {
              const profit = c.totalRevenue - c.totalCost;
              const positive = profit >= 0;
              const data = c.rows
                .slice()
                .sort((a, b) => a.month_start.localeCompare(b.month_start))
                .map((r) => {
                  const d = new Date(r.month_start + "T00:00:00Z");
                  return {
                    month: MONTHS[d.getUTCMonth()],
                    Charged: Number(r.revenue ?? 0),
                    Cost: Number(r.labor_cost ?? 0) + Number(r.external_cost ?? 0),
                    Hours: Number(r.hours ?? 0),
                  };
                });
              return (
                <div key={c.id} className="rounded-lg border bg-card p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{c.name}</p>
                    <div className="flex items-center gap-3 text-xs font-mono">
                      <span className="text-muted-foreground">{c.totalHours.toFixed(1)}h</span>
                      <span>{usd(c.totalRevenue)}</span>
                      <span className={positive ? "text-success" : "text-destructive"}>
                        ({positive ? "+" : ""}{usd(profit)})
                      </span>
                    </div>
                  </div>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))"
                          tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : `${v}`} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }}
                          stroke="hsl(var(--muted-foreground))" />
                        <Tooltip
                          contentStyle={{
                            background: "hsl(var(--background))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 6,
                            fontSize: 12,
                          }}
                          formatter={(value: any, name: string) => {
                            if (name === "Hours") return [`${Number(value).toFixed(1)}h`, name];
                            return [usd(Number(value)), name];
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar yAxisId="left" dataKey="Charged" fill="hsl(var(--primary))" radius={[3,3,0,0]} />
                        <Bar yAxisId="left" dataKey="Cost" fill="hsl(var(--destructive))" radius={[3,3,0,0]} />
                        <Line yAxisId="right" type="monotone" dataKey="Hours"
                          stroke="hsl(var(--warning))" strokeWidth={2}
                          dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}