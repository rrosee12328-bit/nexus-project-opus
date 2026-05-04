import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, RefreshCw, ArrowUpRight, Sparkles, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  onboarding: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  prospect: "bg-primary/15 text-primary border-primary/30",
  lead: "bg-violet-500/15 text-violet-600 border-violet-500/30",
  closed: "bg-muted text-muted-foreground border-border",
};

const SENTIMENT_COLOR: Record<string, string> = {
  positive: "text-emerald-600",
  neutral: "text-muted-foreground",
  concerned: "text-amber-600",
  negative: "text-rose-600",
  unknown: "text-muted-foreground",
};

type ClientRow = {
  id: string;
  name: string;
  status: string;
  monthly_fee: number | null;
  last_contact_date: string | null;
  ai: {
    headline: string | null;
    summary: string | null;
    next_step: string | null;
    sentiment: string | null;
    notes_count: number;
    calls_count: number;
    generated_at: string;
  } | null;
  attention: boolean;
};

interface ClientSummariesPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClientSummariesPanel({ open, onOpenChange }: ClientSummariesPanelProps) {
  const [search, setSearch] = useState("");
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: clients = [], isLoading, refetch } = useQuery({
    queryKey: ["client-summaries-panel"],
    queryFn: async () => {
      const { data: clientRows, error: cErr } = await supabase
        .from("clients")
        .select("id, name, status, monthly_fee, last_contact_date")
        .order("name");
      if (cErr) throw cErr;

      const { data: summaries } = await supabase
        .from("client_ai_summaries" as any)
        .select("client_id, headline, summary, next_step, sentiment, notes_count, calls_count, generated_at");

      const byId = new Map<string, any>();
      for (const s of (summaries as any[]) ?? []) byId.set(s.client_id, s);

      return (clientRows ?? []).map((c) => {
        const s = byId.get(c.id);
        const stale = s ? false : true;
        const negative = s?.sentiment === "negative" || s?.sentiment === "concerned";
        const overdue = c.status === "active" && c.last_contact_date && (Date.now() - new Date(c.last_contact_date).getTime()) > 14 * 86400000;
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          monthly_fee: c.monthly_fee,
          last_contact_date: c.last_contact_date,
          ai: s ? {
            headline: s.headline,
            summary: s.summary,
            next_step: s.next_step,
            sentiment: s.sentiment,
            notes_count: s.notes_count ?? 0,
            calls_count: s.calls_count ?? 0,
            generated_at: s.generated_at,
          } : null,
          attention: stale || negative || !!overdue,
        } as ClientRow;
      });
    },
    enabled: open,
    staleTime: 30_000,
  });

  // Realtime: refetch when summaries change
  useEffect(() => {
    if (!open) return;
    const ch = supabase
      .channel("client-ai-summaries-panel")
      .on("postgres_changes", { event: "*", schema: "public", table: "client_ai_summaries" }, () => {
        qc.invalidateQueries({ queryKey: ["client-summaries-panel"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [open, qc]);

  // Auto-fill missing summaries on first open
  useEffect(() => {
    if (!open || clients.length === 0) return;
    const missing = clients.filter((c) => !c.ai).map((c) => c.id);
    if (missing.length === 0) return;
    supabase.functions.invoke("generate-client-summary", {
      body: { client_ids: missing.slice(0, 12) },
    }).catch(() => {});
  }, [open, clients.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAll = async () => {
    setRefreshingAll(true);
    try {
      const { error } = await supabase.functions.invoke("generate-client-summary", {
        body: { all: true, max_age_minutes: 0 },
      });
      if (error) throw error;
      toast.success("Refreshing all client summaries…");
      setTimeout(() => refetch(), 1500);
    } catch (e: any) {
      toast.error(e?.message ?? "Refresh failed");
    } finally {
      setRefreshingAll(false);
    }
  };

  const refreshOne = async (id: string) => {
    setRefreshingId(id);
    try {
      const { error } = await supabase.functions.invoke("generate-client-summary", {
        body: { client_id: id, force: true },
      });
      if (error) throw error;
    } catch (e: any) {
      toast.error(e?.message ?? "Refresh failed");
    } finally {
      setRefreshingId(null);
    }
  };

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    if (a.attention !== b.attention) return a.attention ? -1 : 1;
    if (!!a.ai !== !!b.ai) return a.ai ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[460px] p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border space-y-3">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-base font-semibold flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Client Summaries
            </SheetTitle>
            <Button size="sm" variant="ghost" onClick={refreshAll} disabled={refreshingAll} className="h-7 text-[11px]">
              <RefreshCw className={`h-3 w-3 mr-1 ${refreshingAll ? "animate-spin" : ""}`} />
              Refresh all
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {isLoading && (
              <div className="text-xs text-muted-foreground text-center py-8">Loading…</div>
            )}

            {!isLoading && sorted.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-8">No clients found.</div>
            )}

            {sorted.map((client) => (
              <div
                key={client.id}
                className="group rounded-lg border border-border/50 bg-card p-3 space-y-2 hover:border-border transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {client.attention && <AlertCircle className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                    <Link
                      to={`/admin/clients/${client.id}`}
                      onClick={() => onOpenChange(false)}
                      className="text-sm font-medium truncate hover:text-primary inline-flex items-center gap-1"
                    >
                      {client.name}
                      <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                    </Link>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${STATUS_COLOR[client.status] ?? ""}`}>
                      {client.status}
                    </Badge>
                    <button
                      onClick={() => refreshOne(client.id)}
                      disabled={refreshingId === client.id}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Regenerate summary"
                    >
                      <RefreshCw className={`h-3 w-3 ${refreshingId === client.id ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                </div>

                {client.ai ? (
                  <>
                    {client.ai.headline && (
                      <p className="text-[12px] font-medium text-foreground leading-snug">{client.ai.headline}</p>
                    )}
                    {client.ai.summary && (
                      <p className="text-[11.5px] text-muted-foreground leading-relaxed">{client.ai.summary}</p>
                    )}
                    {client.ai.next_step && (
                      <div className="text-[11px] border-l-2 border-primary/40 pl-2 text-foreground/80">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mr-1">Next:</span>
                        {client.ai.next_step}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-muted-foreground/80 font-mono">
                      <span>
                        {formatDistanceToNow(new Date(client.ai.generated_at), { addSuffix: true })}
                        {" · "}
                        {client.ai.calls_count} calls · {client.ai.notes_count} notes
                      </span>
                      {client.ai.sentiment && client.ai.sentiment !== "unknown" && (
                        <span className={`capitalize ${SENTIMENT_COLOR[client.ai.sentiment] ?? ""}`}>
                          {client.ai.sentiment}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground/60 italic">Generating summary…</p>
                )}

                {client.monthly_fee != null && client.monthly_fee > 0 && (
                  <div className="text-[10px] text-muted-foreground/70 pt-1 border-t border-border/40">
                    ${client.monthly_fee.toLocaleString()}/mo
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
