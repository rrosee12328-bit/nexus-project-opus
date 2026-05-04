import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  RefreshCw,
  Search,
  AlertCircle,
  ArrowUpRight,
  FileText,
  Users,
} from "lucide-react";
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

type Row = {
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
    model: string | null;
  } | null;
  attention: boolean;
};

export default function AdminSummaries() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const { data: clients = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-client-summaries-page"],
    queryFn: async () => {
      const { data: clientRows, error: cErr } = await supabase
        .from("clients")
        .select("id, name, status, monthly_fee, last_contact_date")
        .order("name");
      if (cErr) throw cErr;

      const { data: summaries } = await supabase
        .from("client_ai_summaries" as any)
        .select(
          "client_id, headline, summary, next_step, sentiment, notes_count, calls_count, generated_at, model"
        );

      const byId = new Map<string, any>();
      for (const s of (summaries as any[]) ?? []) byId.set(s.client_id, s);

      return (clientRows ?? []).map((c) => {
        const s = byId.get(c.id);
        const negative = s?.sentiment === "negative" || s?.sentiment === "concerned";
        const overdue =
          c.status === "active" &&
          c.last_contact_date &&
          Date.now() - new Date(c.last_contact_date).getTime() > 14 * 86400000;
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          monthly_fee: c.monthly_fee,
          last_contact_date: c.last_contact_date,
          ai: s
            ? {
                headline: s.headline,
                summary: s.summary,
                next_step: s.next_step,
                sentiment: s.sentiment,
                notes_count: s.notes_count ?? 0,
                calls_count: s.calls_count ?? 0,
                generated_at: s.generated_at,
                model: s.model,
              }
            : null,
          attention: !s || negative || !!overdue,
        } as Row;
      });
    },
  });

  // Realtime updates
  useEffect(() => {
    const ch = supabase
      .channel("admin-client-summaries-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_ai_summaries" },
        () => qc.invalidateQueries({ queryKey: ["admin-client-summaries-page"] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  // Auto-fill missing on first load
  useEffect(() => {
    if (clients.length === 0) return;
    const missing = clients.filter((c) => !c.ai).map((c) => c.id);
    if (missing.length === 0) return;
    supabase.functions
      .invoke("generate-client-summary", { body: { client_ids: missing.slice(0, 12) } })
      .catch(() => {});
  }, [clients.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setTimeout(() => refetch(), 1200);
    } catch (e: any) {
      toast.error(e?.message ?? "Refresh failed");
    } finally {
      setRefreshingId(null);
    }
  };

  const filtered = useMemo(
    () => clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [clients, search]
  );

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        if (a.attention !== b.attention) return a.attention ? -1 : 1;
        if (!!a.ai !== !!b.ai) return a.ai ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [filtered]
  );

  const selected = sorted.find((c) => c.id === selectedId) ?? sorted[0] ?? null;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden -m-3 sm:-m-4 md:-m-6">
      {/* Left: client list */}
      <div className="w-72 border-r border-border flex flex-col bg-muted/30 shrink-0">
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Client Summaries
            </h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={refreshAll}
              disabled={refreshingAll}
              className="h-7 text-[11px]"
            >
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
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {isLoading && (
              <p className="text-xs text-muted-foreground text-center py-8">Loading…</p>
            )}
            {!isLoading && sorted.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No clients found.</p>
            )}
            {sorted.map((c) => {
              const isSelected = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors text-sm ${
                    isSelected
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted text-foreground/80"
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {c.attention && (
                      <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />
                    )}
                    <span className="truncate flex-1 font-medium">{c.name}</span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1 py-0 capitalize shrink-0 ${
                        STATUS_COLOR[c.status] ?? ""
                      }`}
                    >
                      {c.status}
                    </Badge>
                  </div>
                  {c.ai?.headline ? (
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-snug">
                      {c.ai.headline}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/60 italic mt-1">
                      Generating…
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Right: detailed view */}
      <div className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <>
            <div className="px-6 md:px-10 py-4 border-b border-border flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-foreground truncate">
                    {selected.name}
                  </h1>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 capitalize ${
                      STATUS_COLOR[selected.status] ?? ""
                    }`}
                  >
                    {selected.status}
                  </Badge>
                </div>
                {selected.ai && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Updated {formatDistanceToNow(new Date(selected.ai.generated_at), { addSuffix: true })}
                    {" · "}
                    {selected.ai.calls_count} calls · {selected.ai.notes_count} notes
                    {selected.ai.sentiment && selected.ai.sentiment !== "unknown" && (
                      <span className={`ml-2 capitalize ${SENTIMENT_COLOR[selected.ai.sentiment] ?? ""}`}>
                        · {selected.ai.sentiment}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refreshOne(selected.id)}
                  disabled={refreshingId === selected.id}
                  className="h-8 text-xs"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 mr-1 ${
                      refreshingId === selected.id ? "animate-spin" : ""
                    }`}
                  />
                  Regenerate
                </Button>
                <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                  <Link to={`/admin/clients/${selected.id}`}>
                    Open client
                    <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                  </Link>
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <article className="px-6 md:px-10 lg:px-16 py-6 md:py-10 max-w-3xl mx-auto space-y-6">
                {selected.ai ? (
                  <>
                    {selected.ai.headline && (
                      <h2 className="text-2xl font-bold text-foreground leading-tight tracking-tight">
                        {selected.ai.headline}
                      </h2>
                    )}

                    {selected.ai.summary && (
                      <p className="text-base text-foreground/85 leading-relaxed whitespace-pre-line">
                        {selected.ai.summary}
                      </p>
                    )}

                    {selected.ai.next_step && (
                      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                        <div className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-1">
                          Next Step
                        </div>
                        <p className="text-sm text-foreground/90 leading-relaxed">
                          {selected.ai.next_step}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="rounded-md border border-border bg-card p-3">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Last contact
                        </div>
                        <div className="text-sm font-medium text-foreground mt-0.5">
                          {selected.last_contact_date
                            ? formatDistanceToNow(new Date(selected.last_contact_date), {
                                addSuffix: true,
                              })
                            : "—"}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-card p-3">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Monthly fee
                        </div>
                        <div className="text-sm font-medium text-foreground mt-0.5">
                          {selected.monthly_fee && selected.monthly_fee > 0
                            ? `$${selected.monthly_fee.toLocaleString()}/mo`
                            : "—"}
                        </div>
                      </div>
                    </div>

                    <p className="text-[10px] text-muted-foreground/70 font-mono pt-4 border-t border-border/40">
                      Generated by {selected.ai.model ?? "AI"} ·{" "}
                      {formatDistanceToNow(new Date(selected.ai.generated_at), {
                        addSuffix: true,
                      })}{" "}
                      · auto-refreshes when calls or notes are added
                    </p>
                  </>
                ) : (
                  <div className="text-center py-16 text-muted-foreground">
                    <Sparkles className="h-10 w-10 mx-auto opacity-30 mb-3" />
                    <p className="text-sm">Generating summary from notes & calls…</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refreshOne(selected.id)}
                      className="mt-3"
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Generate now
                    </Button>
                  </div>
                )}
              </article>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <div className="text-center space-y-2">
              <Users className="h-10 w-10 mx-auto opacity-30" />
              <p>Select a client to view their rolling summary</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
