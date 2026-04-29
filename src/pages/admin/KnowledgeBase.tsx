import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  format, parseISO, formatDistanceToNow, differenceInDays,
  startOfWeek, addDays, subDays, isSameDay,
} from "date-fns";
import { toast } from "sonner";
import {
  Brain, BookOpen, FileText, Lightbulb, MessageSquare,
  Search, Trash2, Download, X, ArrowUpRight, Command,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  date: string;
};

type Client = { id: string; name: string };

const SOURCE_META: Record<Memory["source"], { label: string; short: string; icon: typeof Brain; dot: string }> = {
  sop:     { label: "SOP",      short: "SOP", icon: BookOpen,      dot: "bg-sky-400" },
  summary: { label: "Summary",  short: "SUM", icon: FileText,      dot: "bg-emerald-400" },
  insight: { label: "Insight",  short: "INS", icon: Lightbulb,     dot: "bg-amber-400" },
  note:    { label: "Note",     short: "NTE", icon: MessageSquare, dot: "bg-violet-400" },
};

/* ---------- data ---------- */
function useBrain() {
  const sops = useQuery({
    queryKey: ["brain-sops"],
    queryFn: async () => (await supabase.from("sops").select("*").order("updated_at", { ascending: false })).data ?? [],
  });
  const summaries = useQuery({
    queryKey: ["brain-summaries"],
    queryFn: async () => (await supabase.from("company_summaries").select("*").order("summary_date", { ascending: false })).data ?? [],
  });
  const insights = useQuery({
    queryKey: ["brain-insights"],
    queryFn: async () => (await supabase.from("strategic_insights").select("*").order("generated_at", { ascending: false })).data ?? [],
  });
  const notes = useQuery({
    queryKey: ["brain-notes"],
    queryFn: async () => (await supabase.from("client_notes").select("*").order("updated_at", { ascending: false })).data ?? [],
  });
  const clients = useQuery({
    queryKey: ["brain-clients"],
    queryFn: async () => ((await supabase.from("clients").select("id,name").order("name")).data ?? []) as Client[],
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
    notes: (notes.data ?? []) as any[],
  };
}

const gistOf = (text: string, max = 180) => {
  const clean = (text ?? "")
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\n+/g, " · ")
    .trim();
  return clean.length > max ? clean.slice(0, max).trim() + "…" : clean;
};

/* ---------- ambient synapse canvas ---------- */
function SynapseCanvas({ memories }: { memories: Memory[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    type Node = { x: number; y: number; vx: number; vy: number; r: number; group: number; intensity: number };
    const groupColors = [
      "rgba(56,189,248,",  // sop
      "rgba(52,211,153,",  // summary
      "rgba(251,191,36,",  // insight
      "rgba(167,139,250,", // note
    ];
    const counts = [0, 0, 0, 0];
    const map: Record<Memory["source"], number> = { sop: 0, summary: 1, insight: 2, note: 3 };
    memories.forEach((m) => counts[map[m.source]]++);
    const total = Math.max(memories.length, 8);

    let nodes: Node[] = [];
    let W = 0, H = 0;

    const seed = () => {
      const rect = wrap.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      ctx.scale(dpr, dpr);

      // distribute nodes proportional to memory counts (capped per group)
      nodes = [];
      counts.forEach((c, gi) => {
        const n = Math.min(Math.max(c, 4), 22);
        for (let i = 0; i < n; i++) {
          nodes.push({
            x: Math.random() * W,
            y: Math.random() * H,
            vx: (Math.random() - 0.5) * 0.12,
            vy: (Math.random() - 0.5) * 0.12,
            r: 1 + Math.random() * 1.8,
            group: gi,
            intensity: 0.5 + Math.random() * 0.5,
          });
        }
      });
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      // soft radial backdrop
      const grad = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, Math.max(W, H) * 0.7);
      grad.addColorStop(0, "rgba(99,102,241,0.06)");
      grad.addColorStop(1, "rgba(99,102,241,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // edges between near nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 110 * 110) {
            const alpha = (1 - d2 / (110 * 110)) * 0.18;
            ctx.strokeStyle = `rgba(148,163,184,${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // nodes with glow
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < -10) n.x = W + 10;
        if (n.x > W + 10) n.x = -10;
        if (n.y < -10) n.y = H + 10;
        if (n.y > H + 10) n.y = -10;

        const c = groupColors[n.group];
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 6);
        g.addColorStop(0, `${c}${0.5 * n.intensity})`);
        g.addColorStop(1, `${c}0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `${c}${0.95 * n.intensity})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    seed();
    draw();

    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); seed(); draw(); });
    ro.observe(wrap);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [memories]);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas ref={ref} className="block" />
    </div>
  );
}

/* ---------- activity heatmap (12 weeks) ---------- */
function ActivityHeatmap({ memories }: { memories: Memory[] }) {
  const weeks = 18;
  const today = new Date();
  const start = startOfWeek(subDays(today, weeks * 7 - 1), { weekStartsOn: 1 });

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    memories.forEach((m) => {
      const k = format(new Date(m.date), "yyyy-MM-dd");
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    return map;
  }, [memories]);

  const max = Math.max(1, ...counts.values());
  const cells: { date: Date; count: number }[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: { date: Date; count: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      const k = format(date, "yyyy-MM-dd");
      col.push({ date, count: counts.get(k) ?? 0 });
    }
    cells.push(col);
  }

  const intensityClass = (c: number) => {
    if (c === 0) return "bg-foreground/[0.04] hover:bg-foreground/10";
    const r = c / max;
    if (r > 0.66) return "bg-primary";
    if (r > 0.33) return "bg-primary/60";
    return "bg-primary/30";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Feed cadence · last {weeks} weeks
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">
          peak {max}/day
        </span>
      </div>
      <div className="flex gap-[3px]">
        {cells.map((col, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {col.map((cell, j) => (
              <div
                key={j}
                className={`h-[10px] w-[10px] rounded-[2px] transition-colors ${intensityClass(cell.count)} ${
                  isSameDay(cell.date, today) ? "ring-1 ring-primary ring-offset-1 ring-offset-background" : ""
                }`}
                title={`${format(cell.date, "MMM d")} — ${cell.count} fed`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- counter (animated) ---------- */
function Counter({ value }: { value: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 700;
    const from = n;
    const to = value;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{n.toLocaleString()}</>;
}

/* ---------- drawer ---------- */
function MemoryDrawer({
  memory, open, onOpenChange, onDelete,
}: {
  memory: Memory | null; open: boolean;
  onOpenChange: (o: boolean) => void; onDelete: (m: Memory) => void;
}) {
  if (!memory) return null;
  const meta = SOURCE_META[memory.source];

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
        <SheetHeader className="space-y-3 text-left">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
            <span className="text-foreground/30">/</span>
            {format(parseISO(memory.date), "MMM d, yyyy")}
            {memory.clientName && (<><span className="text-foreground/30">/</span>{memory.clientName}</>)}
          </div>
          <SheetTitle className="text-2xl leading-tight">{memory.title}</SheetTitle>
          <SheetDescription className="sr-only">Memory details</SheetDescription>
        </SheetHeader>

        <div className="mt-6 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/85">
          {memory.content || <span className="text-muted-foreground italic">No content.</span>}
        </div>

        <div className="mt-8 flex gap-2 justify-end border-t border-border/60 pt-4">
          <Button variant="ghost" size="sm" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export .md
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(memory)}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ---------- main ---------- */
export default function AdminKnowledgeBase() {
  const queryClient = useQueryClient();
  const { memories, counts, clientMap, isLoading, notes } = useBrain();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | Memory["source"]>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [active, setActive] = useState<Memory | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Memory | null>(null);

  const tableMap: Record<Memory["source"], "sops" | "company_summaries" | "strategic_insights" | "client_notes"> = {
    sop: "sops", summary: "company_summaries", insight: "strategic_insights", note: "client_notes",
  };

  const deleteMut = useMutation({
    mutationFn: async (m: Memory) => {
      const { error } = await supabase.from(tableMap[m.source]).delete().eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: (_d, m) => {
      toast.success("Memory deleted");
      const key = m.source === "sop" ? "sops"
        : m.source === "summary" ? "summaries"
        : m.source === "insight" ? "insights" : "notes";
      queryClient.invalidateQueries({ queryKey: [`brain-${key}`] });
      setActive(null); setConfirmDelete(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Cmd+K focus
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault(); searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tagCloud = useMemo(() => {
    const c = new Map<string, number>();
    memories.forEach((m) => { if (m.tag) c.set(m.tag, (c.get(m.tag) ?? 0) + 1); });
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18);
  }, [memories]);

  const topClients = useMemo(() => {
    const c = new Map<string, number>();
    notes.forEach((n) => { if (n.client_id) c.set(n.client_id, (c.get(n.client_id) ?? 0) + 1); });
    return [...c.entries()].map(([id, count]) => ({ id, count, name: clientMap.get(id) ?? "—" }))
      .sort((a, b) => b.count - a.count).slice(0, 6);
  }, [notes, clientMap]);

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

  const lastFed = memories[0]?.date;
  const daysSinceLastFed = lastFed ? differenceInDays(new Date(), new Date(lastFed)) : null;
  const activeFilterCount = (sourceFilter !== "all" ? 1 : 0) + (tagFilter ? 1 : 0) + (clientFilter ? 1 : 0);

  const stats = [
    { key: "total" as const, label: "MEMORIES", value: counts.total, source: null as Memory["source"] | null },
    { key: "sop" as const, label: "SOP", value: counts.sop, source: "sop" as const },
    { key: "summary" as const, label: "SUMMARY", value: counts.summary, source: "summary" as const },
    { key: "insight" as const, label: "INSIGHT", value: counts.insight, source: "insight" as const },
    { key: "note" as const, label: "NOTE", value: counts.note, source: "note" as const },
  ];

  return (
    <div className="min-h-screen">
      {/* === HERO === */}
      <section className="relative border-b border-border/60 overflow-hidden">
        <div className="absolute inset-0">
          <SynapseCanvas memories={memories} />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />

        <div className="relative container mx-auto px-4 sm:px-6 max-w-7xl pt-10 pb-16">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                <Brain className="h-3 w-3" />
                Vektiss / Knowledge layer
              </div>
              <h1 className="mt-3 text-4xl sm:text-5xl font-semibold tracking-tight">
                The Brain
              </h1>
              <p className="mt-3 max-w-md text-sm text-muted-foreground leading-relaxed">
                The persistent memory your AI draws from. Every SOP, summary, insight and note,
                synapsed together.
              </p>
            </div>
            <FeedTheBrainButton />
          </div>

          {/* dense stat strip */}
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-5 border border-border/60 bg-background/60 backdrop-blur-md rounded-lg overflow-hidden">
            {stats.map((s, i) => {
              const active = sourceFilter === s.source || (s.key === "total" && sourceFilter === "all");
              return (
                <button
                  key={s.key}
                  onClick={() => setSourceFilter(s.source ?? "all")}
                  className={`relative text-left px-5 py-4 transition-colors ${
                    i > 0 ? "sm:border-l border-border/60" : ""
                  } ${active ? "bg-primary/5" : "hover:bg-foreground/[0.02]"}`}
                >
                  {active && <span className="absolute top-0 left-0 right-0 h-px bg-primary" />}
                  <div className="text-[10px] font-mono tracking-wider text-muted-foreground">
                    {s.label}
                  </div>
                  <div className="mt-1 text-3xl font-semibold tabular-nums">
                    <Counter value={s.value} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* secondary meta row */}
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-mono text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {lastFed ? `last fed ${formatDistanceToNow(new Date(lastFed), { addSuffix: true })}` : "never fed"}
            </span>
            {daysSinceLastFed !== null && daysSinceLastFed > 7 && (
              <span className="text-amber-500">⚠ stale — feed me</span>
            )}
            <span>{clientMap.size} clients tracked</span>
            <span>{tagCloud.length} active topics</span>
          </div>
        </div>
      </section>

      {/* === BODY === */}
      <div className="container mx-auto px-4 sm:px-6 max-w-7xl py-8 space-y-10">
        {/* heatmap + tags + clients (3-col editorial row) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7">
            <ActivityHeatmap memories={memories} />
          </div>

          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
                Top topics
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tagCloud.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                {tagCloud.map(([tag, count]) => {
                  const isActive = tagFilter === tag;
                  return (
                    <button
                      key={tag}
                      onClick={() => setTagFilter(isActive ? null : tag)}
                      className={`text-[11px] font-mono px-2 py-0.5 rounded-sm border transition-colors ${
                        isActive
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/60 text-foreground/70 hover:border-foreground/40"
                      }`}
                    >
                      {tag}
                      <span className="opacity-50 ml-1">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
                Most-noted clients
              </div>
              <ul className="space-y-1.5">
                {topClients.length === 0 && <li className="text-xs text-muted-foreground">—</li>}
                {topClients.map((c) => {
                  const isActive = clientFilter === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => setClientFilter(isActive ? null : c.id)}
                        className={`w-full flex items-baseline justify-between gap-3 group text-left ${
                          isActive ? "text-primary" : "text-foreground/80 hover:text-foreground"
                        }`}
                      >
                        <span className="text-xs truncate">{c.name}</span>
                        <span className="flex-1 border-b border-dotted border-border/60 mx-1 translate-y-[-3px]" />
                        <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{c.count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* === MEMORY STREAM === */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-3">
              <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
                Memory stream
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {filtered.length} of {counts.total}
              </span>
            </div>

            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="Search memories…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-12 h-9 text-sm bg-transparent"
              />
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground border border-border/60 rounded px-1 py-0.5">
                <Command className="h-2.5 w-2.5" />K
              </kbd>
            </div>
          </div>

          {activeFilterCount > 0 && (
            <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
              <span>filtered by</span>
              {sourceFilter !== "all" && (
                <Badge variant="outline" className="gap-1 font-mono text-[10px]">
                  {SOURCE_META[sourceFilter].short}
                  <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setSourceFilter("all")} />
                </Badge>
              )}
              {tagFilter && (
                <Badge variant="outline" className="gap-1 font-mono text-[10px]">
                  #{tagFilter}
                  <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setTagFilter(null)} />
                </Badge>
              )}
              {clientFilter && (
                <Badge variant="outline" className="gap-1 font-mono text-[10px]">
                  @{clientMap.get(clientFilter) ?? "client"}
                  <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setClientFilter(null)} />
                </Badge>
              )}
              <button
                className="text-foreground/60 hover:text-foreground underline-offset-2 hover:underline"
                onClick={() => { setSourceFilter("all"); setTagFilter(null); setClientFilter(null); }}
              >
                clear
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="py-16 text-center text-xs font-mono text-muted-foreground">
              <span className="inline-block animate-pulse">loading neurons…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground border border-dashed border-border/60 rounded-lg">
              Nothing matches. Try clearing filters or feeding the brain.
            </div>
          ) : (
            <div className="border-t border-border/60">
              {filtered.map((m, i) => {
                const meta = SOURCE_META[m.source];
                return (
                  <button
                    key={`${m.source}-${m.id}`}
                    onClick={() => setActive(m)}
                    className="group w-full text-left border-b border-border/60 hover:bg-foreground/[0.02] transition-colors"
                    style={{ animation: `fadeIn 0.4s ease-out ${Math.min(i * 0.015, 0.4)}s both` }}
                  >
                    <div className="grid grid-cols-12 gap-4 py-4 px-1 items-baseline">
                      <div className="col-span-12 sm:col-span-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        {meta.short}
                        <span className="text-foreground/30">·</span>
                        <span className="tabular-nums">
                          {format(new Date(m.date), "MMM d")}
                        </span>
                      </div>
                      <div className="col-span-12 sm:col-span-7">
                        <div className="text-[15px] font-medium leading-snug group-hover:text-primary transition-colors">
                          {m.title}
                        </div>
                        <div className="mt-1 text-[13px] text-muted-foreground line-clamp-1 leading-relaxed">
                          {gistOf(m.content) || <span className="italic opacity-60">empty</span>}
                        </div>
                      </div>
                      <div className="col-span-12 sm:col-span-3 flex items-center justify-end gap-2 flex-wrap">
                        {m.clientName && (
                          <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[140px]">
                            @{m.clientName}
                          </span>
                        )}
                        {m.tag && (
                          <span className="text-[11px] font-mono text-foreground/60">#{m.tag}</span>
                        )}
                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
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

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}