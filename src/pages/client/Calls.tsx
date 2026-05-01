import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CallSummaryMarkdown, getBriefSummary } from "@/components/admin/CallSummaryMarkdown";
import { format } from "date-fns";
import { Search, Calendar, Phone, ChevronDown, ChevronRight } from "lucide-react";

type ClientCall = {
  id: string;
  call_date: string;
  call_type: string | null;
  summary: string | null;
  key_decisions: any;
  sentiment: string | null;
  duration_minutes: number | null;
};

export default function ClientCalls() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: clientId } = useQuery({
    queryKey: ["my-client-id", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.rpc("get_client_id_for_user", { _user_id: user.id });
      return data as string | null;
    },
    enabled: !!user?.id,
  });

  const { data: calls = [], isLoading } = useQuery({
    queryKey: ["client-calls", clientId],
    queryFn: async () => {
      if (!clientId) return [] as ClientCall[];
      const { data, error } = await supabase
        .from("call_intelligence")
        .select("id, call_date, call_type, summary, key_decisions, sentiment, duration_minutes")
        .eq("client_id", clientId)
        .order("call_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientCall[];
    },
    enabled: !!clientId,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return calls;
    return calls.filter((c) => {
      const blob = [
        c.summary ?? "",
        c.call_type ?? "",
        Array.isArray(c.key_decisions) ? c.key_decisions.join(" ") : "",
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [calls, search]);

  // Group by month for the timeline
  const grouped = useMemo(() => {
    const map = new Map<string, ClientCall[]>();
    for (const c of filtered) {
      const key = format(new Date(c.call_date), "MMMM yyyy");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 px-3 sm:px-0 pb-8 sm:pb-12">
      <header className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Call History</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          A timeline of every call we've had together — what was discussed, decided, and where we go next.
        </p>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search calls, decisions, topics…"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <Phone className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            {calls.length === 0
              ? "No call summaries yet. They'll show up here after our next meeting."
              : "No calls match your search."}
          </p>
        </Card>
      ) : (
        <div className="relative pl-5 sm:pl-6">
          {/* Vertical timeline line */}
          <div className="absolute left-1.5 sm:left-2 top-2 bottom-2 w-px bg-border" aria-hidden />

          {grouped.map(([month, items]) => (
            <section key={month} className="mb-6 sm:mb-8">
              <div className="flex items-center gap-2 mb-3 -ml-5 sm:-ml-6">
                <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full bg-primary/20 border-2 border-primary flex-shrink-0" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {month}
                </h2>
              </div>

              <div className="space-y-2.5 sm:space-y-3">
                {items.map((call) => {
                  const isOpen = openId === call.id;
                  const brief = getBriefSummary(call.summary, 160) || "Summary not available yet.";
                  const decisions = Array.isArray(call.key_decisions) ? call.key_decisions : [];
                  return (
                    <Card key={call.id} className="overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setOpenId(isOpen ? null : call.id)}
                        className="w-full text-left p-3 sm:p-4 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 sm:gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-xs text-muted-foreground mb-1.5">
                              <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                              <span className="truncate">
                                <span className="sm:hidden">{format(new Date(call.call_date), "MMM d • h:mm a")}</span>
                                <span className="hidden sm:inline">{format(new Date(call.call_date), "EEE, MMM d • h:mm a")}</span>
                              </span>
                              {call.duration_minutes ? (
                                <span>· {call.duration_minutes} min</span>
                              ) : null}
                              {call.call_type ? (
                                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
                                  {call.call_type}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="text-[13px] sm:text-sm font-medium text-foreground leading-snug">
                              {brief}
                            </p>
                            {!isOpen && decisions.length > 0 && (
                              <p className="text-[11px] sm:text-xs text-muted-foreground mt-1.5">
                                {decisions.length} key decision{decisions.length === 1 ? "" : "s"}
                              </p>
                            )}
                          </div>
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                          )}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-0 border-t border-border/60 bg-muted/20">
                          {decisions.length > 0 && (
                            <div className="mt-4">
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                Key decisions
                              </h4>
                              <ul className="space-y-1 ml-4 list-disc">
                                {decisions.map((d: any, idx: number) => (
                                  <li key={idx} className="text-[13px] sm:text-sm text-foreground/80">
                                    {typeof d === "string" ? d : JSON.stringify(d)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {call.summary ? (
                            <div className="mt-4">
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                What was discussed
                              </h4>
                              <CallSummaryMarkdown content={call.summary} />
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground mt-4">
                              No detailed summary available.
                            </p>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}