import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, formatDistanceToNow, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Brain, BookOpen, FileText, Lightbulb, MessageSquare,
  Search, Sparkles, AlertTriangle, Clock, Activity, Trash2,
  Download, X, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FeedTheBrainButton } from "@/components/FeedTheBrainDialog";

/* ---------- types ---------- */
type Memory = {
  id: string;
  source: "sop" | "summary" | "insight" | "note";
  title: string;
  content: string;
  tag?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  date: string; // ISO
};

type Client = { id: string; name: string };

const SOURCE_META: Record<Memory["source"], { label: string; icon: typeof Brain; color: string }> = {
  sop:     { label: "SOP",      icon: BookOpen,      color: "text-blue-400" },
  summary: { label: "Summary",  icon: FileText,      color: "text-emerald-400" },
  insight: { label: "Insight",  icon: Lightbulb,     color: "text-amber-400" },
  note:    { label: "Note",     icon: MessageSquare, color: "text-purple-400" },
};

/* ---------- data hook ---------- */
function useBrain() {
  const sops = useQuery({
    queryKey: ["brain-sops"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sops").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const summaries = useQuery({
    queryKey: ["brain-summaries"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_summaries").select("*").order("summary_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const insights = useQuery({
    queryKey: ["brain-insights"],
    queryFn: async () => {
      const { data, error } = await supabase.from("strategic_insights").select("*").order("generated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const notes = useQuery({
    queryKey: ["brain-notes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_notes").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const clients = useQuery({
    queryKey: ["brain-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });

  const clientMap = useMemo(() => {
    const m = new Map<string, string>();
    (clients.data ?? []).forEach((c) => m.set(c.id, c.name));
    return m;
  }, [clients.data]);

  const memories: Memory[] = useMemo(() => {
    const list: Memory[] = [];
    (sops.data ?? []).forEach((s: any) => list.push({
      id: s.id, source: "sop", title: s.title, content: s.content,
      tag: s.category, clientId: null, clientName: null, date: s.updated_at,
    }));
    (summaries.data ?? []).forEach((s: any) => list.push({
      id: s.id, source: "summary", title: s.title, content: s.content,
      tag: null, clientId: null, clientName: null, date: s.summary_date,
    }));
    (insights.data ?? []).forEach((i: any) => list.push({
      id: i.id, source: "insight", title: i.title, content: i.description,
      tag: i.insight_type, clientId: null, clientName: null,
      date: i.generated_at ?? new Date().toISOString(),
    }));
    (notes.data ?? []).forEach((n: any) => list.push({
      id: n.id, source: "note", title: n.title, content: n.content ?? "",
      tag: n.type, clientId: n.client_id, clientName: clientMap.get(n.client_id) ?? null,
      date: n.updated_at,
    }));
    return list.sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [sops.data, summaries.data, insights.data, notes.data, clientMap]);

  return {
    memories,
    counts: {
      total: memories.length,
      sop: sops.data?.length ?? 0,
      summary: summaries.data?.length ?? 0,
      insight: insights.data?.length ?? 0,
      note: notes.data?.length ?? 0,
    },
    clients: clients.data ?? [],
    clientMap,
    isLoading: sops.isLoading || summaries.isLoading || insights.isLoading || notes.isLoading,
    notesByClient: (notes.data ?? []) as any[],
  };
}

/* ---------- helpers ---------- */
function gistOf(text: string, max = 140) {
  const clean = (text ?? "")
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*|__/g, "")
    .replace(/\n+/g, " ")
    .trim();
  return clean.length > max ? clean.slice(0, max).trim() + "…" : clean;
}

/* ---------- stats orbs ---------- */
function StatOrb({ label, value, icon: Icon, accent, delay }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
    >
      <Card className="overflow-hidden relative">
        <div className={`absolute -top-8 -right-8 h-24 w-24 rounded-full ${accent} opacity-20 blur-2xl`} />
        <CardContent className="p-4 flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${accent} bg-opacity-15`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-semibold leading-none">{value}</div>
            <div className="text-xs text-muted-foreground mt-1">{label}</div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ---------- mind map ---------- */
function MindMap({
  counts, topClients, onPick,
}: {
  counts: { sop: number; summary: number; insight: number; note: number };
  topClients: { id: string; name: string; count: number }[];
  onPick: (filter: { source?: Memory["source"]; clientId?: string }) => void;
}) {
  const branches = [
    { label: "SOPs", source: "sop" as const, count: counts.sop, color: "hsl(217 91% 60%)" },
    { label: "Summaries", source: "summary" as const, count: counts.summary, color: "hsl(160 84% 39%)" },
    { label: "Insights", source: "insight" as const, count: counts.insight, color: "hsl(43 96% 56%)" },
    { label: "Notes", source: "note" as const, count: counts.note, color: "hsl(280 75% 60%)" },
  ];
  const W = 600, H = 360, cx = W / 2, cy = H / 2;
  const radius = 140;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="relative w-full" style={{ aspectRatio: `${W}/${H}` }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full">
            {/* edges */}
            {branches.map((b, i) => {
              const a = (i / branches.length) * Math.PI * 2 - Math.PI / 2;
              const x = cx + Math.cos(a) * radius;
              const y = cy + Math.sin(a) * radius;
              return (
                <line key={b.label} x1={cx} y1={cy} x2={x} y2={y}
                  stroke="hsl(var(--border))" strokeWidth={1.5} strokeDasharray="3 4" />
              );
            })}
            {/* client edges (sub-branch off Notes) */}
            {topClients.slice(0, 5).map((c, i) => {
              const noteIdx = branches.findIndex((b) => b.source === "note");
              const aParent = (noteIdx / branches.length) * Math.PI * 2 - Math.PI / 2;
              const px = cx + Math.cos(aParent) * radius;
              const py = cy + Math.sin(aParent) * radius;
              const spread = (i - (topClients.slice(0, 5).length - 1) / 2) * 0.35;
              const a2 = aParent + spread;
              const x = px + Math.cos(a2) * 70;
              const y = py + Math.sin(a2) * 70;
              return (
                <g key={c.id}>
                  <line x1={px} y1={py} x2={x} y2={y} stroke="hsl(var(--border))" strokeWidth={1} opacity={0.5} />
                  <circle cx={x} cy={y} r={5} fill="hsl(280 75% 60%)" opacity={0.7} className="cursor-pointer"
                    onClick={() => onPick({ clientId: c.id })} />
                  <text x={x} y={y + 18} fontSize="9" fill="hsl(var(--muted-foreground))"
                    textAnchor="middle" className="pointer-events-none">
                    {c.name.length > 14 ? c.name.slice(0, 13) + "…" : c.name}
                  </text>
                </g>
              );
            })}
            {/* center: brain */}
            <circle cx={cx} cy={cy} r={36} fill="hsl(var(--primary))" opacity={0.15} />
            <circle cx={cx} cy={cy} r={28} fill="hsl(var(--primary))" />
            <text x={cx} y={cy + 5} fontSize="13" fontWeight="600" fill="hsl(var(--primary-foreground))"
              textAnchor="middle" className="pointer-events-none">BRAIN</text>
            {/* branch nodes */}
            {branches.map((b, i) => {
              const a = (i / branches.length) * Math.PI * 2 - Math.PI / 2;
              const x = cx + Math.cos(a) * radius;
              const y = cy + Math.sin(a) * radius;
              const r = 18 + Math.min(b.count, 30) * 0.4;
              return (
                <g key={b.label} className="cursor-pointer" onClick={() => onPick({ source: b.source })}>
                  <circle cx={x} cy={y} r={r} fill={b.color} opacity={0.2} />
                  <circle cx={x} cy={y} r={r - 4} fill={b.color} opacity={0.85} />
                  <text x={x} y={y + 4} fontSize="13" fontWeight="700" fill="white"
                    textAnchor="middle" className="pointer-events-none">{b.count}</text>
                  <text x={x} y={y + r + 14} fontSize="11" fill="hsl(var(--foreground))"
                    textAnchor="middle" className="pointer-events-none">{b.label}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- pulse + gaps ---------- */
function PulseFeed({
  recent, gaps,
}: {
  recent: Memory[];
  gaps: { label: string; severity: "warn" | "info" }[];
}) {
  return (
    <Card className="h-full">
      <CardContent className="p-4 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Pulse</h3>
          </div>
          <ScrollArea className="h-[160px] pr-2">
            <ul className="space-y-2">
              {recent.length === 0 && (
                <li className="text-xs text-muted-foreground">No recent activity yet.</li>
              )}
              {recent.map((m) => {
                const meta = SOURCE_META[m.source];
                const Icon = meta.icon;
                return (
                  <li key={`${m.source}-${m.id}`} className="flex items-start gap-2 text-xs">
                    <Icon className={`h-3.5 w-3.5 mt-0.5 ${meta.color}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-foreground/90">{m.title}</div>
                      <div className="text-muted-foreground">
                        {meta.label}{m.clientName ? ` · ${m.clientName}` : ""} ·{" "}
                        {formatDistanceToNow(new Date(m.date), { addSuffix: true })}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </div>

        <div className="border-t border-border pt-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold">Gaps detected</h3>
          </div>
          {gaps.length === 0 ? (
            <p className="text-xs text-muted-foreground">Brain looks healthy. No gaps.</p>
          ) : (
            <ul className="space-y-1.5">
              {gaps.map((g, i) => (
                <li key={i} className="text-xs flex items-start gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full mt-1.5 ${g.severity === "warn" ? "bg-amber-400" : "bg-muted-foreground"}`} />
                  <span className="text-foreground/80">{g.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- memory drawer ---------- */
function MemoryDrawer({
  memory, open, onOpenChange, onDelete,
}: {
  memory: Memory | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDelete: (m: Memory) => void;
}) {
  if (!memory) return null;
  const meta = SOURCE_META[memory.source];
  const Icon = meta.icon;

  const handleDownload = () => {
    const blob = new Blob([`# ${memory.title}\n\n${memory.content}`], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${memory.title.replace(/[^\w]+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-md bg-muted flex items-center justify-center ${meta.color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
            {memory.tag && <Badge variant="outline" className="text-[10px] capitalize">{memory.tag}</Badge>}
            {memory.clientName && <Badge variant="secondary" className="text-[10px]">{memory.clientName}</Badge>}
          </div>
          <SheetTitle className="text-left">{memory.title}</SheetTitle>
          <SheetDescription className="text-left text-xs">
            Last updated {format(parseISO(memory.date), "MMM d, yyyy")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 prose prose-sm dark:prose-invert max-w-none">
          <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/90 bg-muted/30 rounded-md p-4 border border-border">
            {memory.content || <span className="text-muted-foreground">No content.</span>}
          </pre>
        </div>

        <div className="mt-6 flex gap-2 justify-end border-t border-border pt-4">
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Download
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onDelete(memory)}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ---------- main page ---------- */
export default function AdminKnowledgeBase() {
  const queryClient = useQueryClient();
  const { memories, counts, clientMap, isLoading, notesByClient } = useBrain();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | Memory["source"]>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [active, setActive] = useState<Memory | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Memory | null>(null);

  const tableMap: Record<Memory["source"], "sops" | "company_summaries" | "strategic_insights" | "client_notes"> = {
    sop: "sops",
    summary: "company_summaries",
    insight: "strategic_insights",
    note: "client_notes",
  };

  const deleteMut = useMutation({
    mutationFn: async (m: Memory) => {
      const { error } = await supabase.from(tableMap[m.source]).delete().eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: (_d, m) => {
      toast.success("Memory deleted");
      queryClient.invalidateQueries({ queryKey: [`brain-${m.source === "sop" ? "sops" : m.source === "summary" ? "summaries" : m.source === "insight" ? "insights" : "notes"}`] });
      setActive(null);
      setConfirmDelete(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const topClients = useMemo(() => {
    const counts = new Map<string, number>();
    notesByClient.forEach((n) => {
      if (!n.client_id) return;
      counts.set(n.client_id, (counts.get(n.client_id) ?? 0) + 1);
    });
    return [...counts.entries()]
      .map(([id, count]) => ({ id, count, name: clientMap.get(id) ?? "Unknown" }))
      .sort((a, b) => b.count - a.count);
  }, [notesByClient, clientMap]);

  const tagCloud = useMemo(() => {
    const counts = new Map<string, number>();
    memories.forEach((m) => {
      if (m.tag) counts.set(m.tag, (counts.get(m.tag) ?? 0) + 1);
    });
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 24);
  }, [memories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return memories.filter((m) => {
      if (sourceFilter !== "all" && m.source !== sourceFilter) return false;
      if (tagFilter && m.tag !== tagFilter) return false;
      if (clientFilter && m.clientId !== clientFilter) return false;
      if (q && !m.title.toLowerCase().includes(q) && !m.content.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [memories, search, sourceFilter, tagFilter, clientFilter]);

  const gaps = useMemo(() => {
    const out: { label: string; severity: "warn" | "info" }[] = [];
    if (counts.insight === 0) out.push({ label: "No strategic insights captured yet.", severity: "warn" });
    if (counts.sop < 5) out.push({ label: `Only ${counts.sop} SOP${counts.sop === 1 ? "" : "s"} on file — document more processes.`, severity: "warn" });
    const clientsWithNotes = new Set(topClients.map((c) => c.id));
    const total = clientMap.size;
    const without = total - clientsWithNotes.size;
    if (without > 0) out.push({ label: `${without} client${without === 1 ? "" : "s"} have no notes yet.`, severity: "warn" });
    const newest = memories[0];
    if (newest && differenceInDays(new Date(), new Date(newest.date)) > 7) {
      out.push({ label: "No new memories in over a week.", severity: "info" });
    }
    return out;
  }, [counts, topClients, clientMap, memories]);

  const lastFed = memories[0]?.date;
  const activeFilterCount = (sourceFilter !== "all" ? 1 : 0) + (tagFilter ? 1 : 0) + (clientFilter ? 1 : 0);

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">The Brain</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Everything your AI knows about the business, at a glance.
            {lastFed && (
              <span className="ml-1">Last fed {formatDistanceToNow(new Date(lastFed), { addSuffix: true })}.</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <FeedTheBrainButton />
        </div>
      </div>

      {/* Stat orbs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatOrb label="Total memories" value={counts.total} icon={Brain}    accent="bg-primary text-primary"        delay={0.0} />
        <StatOrb label="SOPs"            value={counts.sop}   icon={BookOpen} accent="bg-blue-500/20 text-blue-400"   delay={0.05} />
        <StatOrb label="Summaries"       value={counts.summary} icon={FileText} accent="bg-emerald-500/20 text-emerald-400" delay={0.1} />
        <StatOrb label="Notes"           value={counts.note}  icon={MessageSquare} accent="bg-purple-500/20 text-purple-400" delay={0.15} />
      </div>

      {/* Mind map + pulse */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <MindMap
            counts={counts}
            topClients={topClients}
            onPick={({ source, clientId }) => {
              if (source) setSourceFilter(source);
              if (clientId) setClientFilter(clientId);
              const el = document.getElementById("memory-grid");
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        </div>
        <div className="lg:col-span-2">
          <PulseFeed recent={memories.slice(0, 6)} gaps={gaps} />
        </div>
      </div>

      {/* Topic cloud */}
      {tagCloud.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Topics on the brain</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {tagCloud.map(({ tag, count }) => {
                const size = 11 + Math.min(count, 10);
                const isActive = tagFilter === tag;
                return (
                  <button
                    key={tag}
                    onClick={() => setTagFilter(isActive ? null : tag)}
                    className={`rounded-full px-3 py-1 transition-colors capitalize ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/70 text-foreground/80"
                    }`}
                    style={{ fontSize: `${size}px` }}
                  >
                    {tag}
                    <span className="ml-1.5 opacity-60 text-xs">{count}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter bar + grid */}
      <div id="memory-grid" className="space-y-3 scroll-mt-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search memories…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(["all", "sop", "summary", "insight", "note"] as const).map((s) => (
              <Button
                key={s}
                variant={sourceFilter === s ? "default" : "outline"}
                size="sm"
                className="h-9 text-xs capitalize"
                onClick={() => setSourceFilter(s)}
              >
                {s === "all" ? "All" : SOURCE_META[s].label}
              </Button>
            ))}
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            <span>Filters:</span>
            {sourceFilter !== "all" && (
              <Badge variant="secondary" className="gap-1 capitalize">
                {SOURCE_META[sourceFilter].label}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setSourceFilter("all")} />
              </Badge>
            )}
            {tagFilter && (
              <Badge variant="secondary" className="gap-1 capitalize">
                {tagFilter}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setTagFilter(null)} />
              </Badge>
            )}
            {clientFilter && (
              <Badge variant="secondary" className="gap-1">
                {clientMap.get(clientFilter) ?? "Client"}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setClientFilter(null)} />
              </Badge>
            )}
            <button
              className="text-primary hover:underline ml-1"
              onClick={() => { setSourceFilter("all"); setTagFilter(null); setClientFilter(null); }}
            >
              Clear all
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Loading the brain…</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No memories match your filters. Try clearing them or feed the brain something new.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((m, i) => {
              const meta = SOURCE_META[m.source];
              const Icon = meta.icon;
              return (
                <motion.button
                  key={`${m.source}-${m.id}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.4), duration: 0.25 }}
                  onClick={() => setActive(m)}
                  className="text-left group"
                >
                  <Card className="h-full hover:border-primary/50 hover:shadow-lg transition-all">
                    <CardContent className="p-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className={`flex items-center gap-1.5 text-xs ${meta.color}`}>
                          <Icon className="h-3.5 w-3.5" />
                          <span className="font-medium">{meta.label}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(m.date), { addSuffix: false })}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                        {m.title}
                      </h4>
                      <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                        {gistOf(m.content) || <span className="italic">No content.</span>}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        {m.tag && (
                          <Badge variant="outline" className="text-[10px] capitalize">{m.tag}</Badge>
                        )}
                        {m.clientName && (
                          <Badge variant="secondary" className="text-[10px]">{m.clientName}</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      <MemoryDrawer
        memory={active}
        open={!!active}
        onOpenChange={(o) => !o && setActive(null)}
        onDelete={(m) => setConfirmDelete(m)}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{confirmDelete?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes it from the AI's memory. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && deleteMut.mutate(confirmDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}