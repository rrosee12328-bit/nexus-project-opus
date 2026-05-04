import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Brain as BrainIcon,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  X,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

type Action = {
  kind: string;
  client_id?: string | null;
  client_name_guess?: string | null;
  client_name_resolved?: string | null;
  confidence: number;
  payload: Record<string, any>;
  reason: string;
};

type ClientLite = { id: string; name: string };

const KIND_LABEL: Record<string, string> = {
  client_note: "Client note",
  client_preference: "Preference",
  client_aspiration: "Aspiration",
  calendar_event: "Calendar event",
  task: "Task",
  company_summary: "Company note",
  client_cost: "Client cost",
  client_payment: "Client payment",
};

const KIND_COLOR: Record<string, string> = {
  client_note: "bg-primary/10 text-primary border-primary/30",
  client_preference: "bg-violet-500/10 text-violet-600 border-violet-500/30",
  client_aspiration: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  calendar_event: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  task: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  company_summary: "bg-foreground/10 text-foreground border-border",
  client_cost: "bg-rose-500/10 text-rose-600 border-rose-500/30",
  client_payment: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
};

const EXAMPLES = [
  "Acme wants to add Instagram, push their next call to June 12, and prefers Tuesdays",
  "Logged $450 payment from Northwind for May, plus a new $120/mo Canva Pro cost",
  "Internal: ship the Brain page tomorrow, high priority, and add 'no AI markdown bold' as a global rule",
];

export default function Brain() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [actions, setActions] = useState<Action[] | null>(null);
  const [clients, setClients] = useState<ClientLite[]>([]);

  useEffect(() => {
    supabase
      .from("clients")
      .select("id, name")
      .order("name")
      .then(({ data }) => setClients((data as ClientLite[]) ?? []));
  }, []);

  const analyze = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setActions(null);
    try {
      const { data, error } = await supabase.functions.invoke("brain-route", {
        body: { mode: "preview", input: input.trim() },
      });
      if (error) throw error;
      const list = (data?.actions ?? []) as Action[];
      setActions(list);
      if (list.length === 0) toast.info("No clear actions detected. Try adding more context.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to analyze");
    } finally {
      setLoading(false);
    }
  };

  const commit = async () => {
    if (!actions || actions.length === 0) return;
    const missing = actions.filter(
      (a) => !["company_summary", "client_preference"].includes(a.kind) && !a.client_id
    );
    if (missing.length > 0) {
      toast.error("Pick a client for every action before saving");
      return;
    }
    setCommitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("brain-route", {
        body: { mode: "commit", actions },
      });
      if (error) throw error;
      const results = data?.results ?? [];
      const ok = results.filter((r: any) => r.ok).length;
      const fail = results.length - ok;
      if (fail === 0) {
        toast.success(`Routed ${ok} item${ok === 1 ? "" : "s"}`);
        setActions(null);
        setInput("");
      } else {
        toast.warning(`${ok} saved, ${fail} failed`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setCommitting(false);
    }
  };

  const updateAction = (i: number, patch: Partial<Action>) =>
    setActions((prev) => prev && prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

  const removeAction = (i: number) =>
    setActions((prev) => prev?.filter((_, idx) => idx !== i) ?? null);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/40 p-6 sm:p-8 bg-[radial-gradient(ellipse_at_top_left,hsl(var(--primary)/0.18),transparent_60%),linear-gradient(135deg,hsl(var(--primary)/0.10),transparent_70%)] shadow-[0_0_60px_-20px_hsl(var(--primary)/0.6),inset_0_1px_0_hsl(var(--primary)/0.3)]">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <div className="flex items-start gap-4">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/40">
            <BrainIcon className="h-6 w-6 text-primary drop-shadow-[0_0_10px_hsl(var(--primary))]" />
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary animate-pulse shadow-[0_0_10px_hsl(var(--primary))]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary/80">Vektiss</span>
              <span className="h-px flex-1 bg-gradient-to-r from-primary/50 to-transparent max-w-[120px]" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Brain</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Universal context router. Dump anything — notes, preferences, calls, payments, tasks —
              and the brain figures out where it belongs across the platform. Always preview first.
            </p>
          </div>
          <kbd className="hidden md:inline shrink-0 text-[10px] px-2 py-1 rounded bg-background/60 border border-border/60 text-muted-foreground font-mono">⌘B</kbd>
        </div>
      </div>

      {/* Input */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Dump context here. e.g. 'Acme wants to add Instagram, push their next call to June 12, and prefers Tuesdays'"
          className="min-h-[140px] text-sm resize-y"
          maxLength={5000}
          disabled={loading || committing}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              if (input.trim() && !loading) analyze();
            }
          }}
        />
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-[10px] text-muted-foreground">
            {input.length}/5000 · ⌘/Ctrl + Enter to analyze
          </span>
          <Button onClick={analyze} disabled={!input.trim() || loading || committing}>
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Analyzing…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-1.5" /> Analyze</>
            )}
          </Button>
        </div>

        {/* Examples */}
        {!actions && !loading && (
          <div className="pt-2 border-t border-border/60 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Zap className="h-3 w-3" /> Try
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setInput(ex)}
                  className="text-[11px] px-2 py-1 rounded border border-border bg-background/60 hover:border-primary/50 hover:bg-primary/5 transition text-left max-w-full truncate"
                  title={ex}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Detected actions · {actions.length}
            </h2>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setActions(null)} disabled={committing}>
                Discard
              </Button>
              <Button size="sm" onClick={commit} disabled={committing}>
                {committing ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</>
                ) : (
                  <>Confirm & route <ArrowRight className="h-3.5 w-3.5 ml-1.5" /></>
                )}
              </Button>
            </div>
          </div>

          <div className="grid gap-3">
            {actions.map((a, i) => {
              const needsClient = !["company_summary", "client_preference"].includes(a.kind);
              const noClientResolved = needsClient && !a.client_id;
              const lowConfidence = a.confidence < 0.7;
              return (
                <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-2 relative">
                  <button
                    onClick={() => removeAction(i)}
                    className="absolute top-2 right-2 p-1 rounded hover:bg-muted text-muted-foreground"
                    title="Skip this action"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex items-center gap-2 flex-wrap pr-6">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${KIND_COLOR[a.kind] ?? ""}`}>
                      {KIND_LABEL[a.kind] ?? a.kind}
                    </Badge>
                    {lowConfidence ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-700 border-amber-500/30">
                        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Confirm
                      </Badge>
                    ) : !noClientResolved ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> High confidence
                      </Badge>
                    ) : null}
                    <span className="text-[10px] text-muted-foreground/70">
                      {Math.round(a.confidence * 100)}%
                    </span>
                  </div>

                  {(needsClient || a.kind === "client_preference") && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider w-14">Client</span>
                      <select
                        value={a.client_id ?? ""}
                        onChange={(e) => updateAction(i, { client_id: e.target.value || null })}
                        className={`flex-1 h-8 text-xs rounded border bg-background px-2 ${noClientResolved ? "border-amber-500/50" : "border-border"}`}
                      >
                        <option value="">
                          {a.kind === "client_preference" ? "— Global preference —" : "— Select client —"}
                        </option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <PayloadEditor action={a} onChange={(patch) => updateAction(i, { payload: { ...a.payload, ...patch } })} />

                  {a.reason && (
                    <p className="text-[10px] text-muted-foreground/70 italic pt-1 border-t border-border/40">
                      {a.reason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {actions === null && !loading && (
        <div className="text-center py-12 text-xs text-muted-foreground">
          <BrainIcon className="h-10 w-10 mx-auto opacity-30 mb-3" />
          <p>Awaiting input. The brain will route your dump into structured actions you can approve.</p>
        </div>
      )}

      {actions?.length === 0 && (
        <div className="text-center py-8 text-xs text-muted-foreground">
          Nothing detected. Try giving more context (who, what, when).
        </div>
      )}
    </div>
  );
}

function PayloadEditor({
  action,
  onChange,
}: {
  action: Action;
  onChange: (patch: Record<string, any>) => void;
}) {
  const p = action.payload || {};
  const Field = ({ label, value, onChange: oc, multiline }: { label: string; value: any; onChange: (v: string) => void; multiline?: boolean }) => (
    <div className="space-y-1">
      <label className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</label>
      {multiline ? (
        <Textarea value={value ?? ""} onChange={(e) => oc(e.target.value)} className="text-xs min-h-[60px] resize-none" />
      ) : (
        <Input value={value ?? ""} onChange={(e) => oc(e.target.value)} className="h-8 text-xs" />
      )}
    </div>
  );

  switch (action.kind) {
    case "client_note":
    case "company_summary":
      return (
        <div className="space-y-2">
          <Field label="Title" value={p.title} onChange={(v) => onChange({ title: v })} />
          <Field label="Content" value={p.content} onChange={(v) => onChange({ content: v })} multiline />
        </div>
      );
    case "client_preference":
      return <Field label="Rule" value={p.rule} onChange={(v) => onChange({ rule: v })} multiline />;
    case "client_aspiration":
      return <Field label="Aspiration" value={p.aspirations} onChange={(v) => onChange({ aspirations: v })} multiline />;
    case "calendar_event":
      return (
        <div className="space-y-2">
          <Field label="Title" value={p.title} onChange={(v) => onChange({ title: v })} />
          <div className="grid grid-cols-3 gap-2">
            <Field label="Date" value={p.event_date} onChange={(v) => onChange({ event_date: v })} />
            <Field label="Start" value={p.start_time} onChange={(v) => onChange({ start_time: v })} />
            <Field label="End" value={p.end_time} onChange={(v) => onChange({ end_time: v })} />
          </div>
        </div>
      );
    case "task":
      return (
        <div className="space-y-2">
          <Field label="Title" value={p.title} onChange={(v) => onChange({ title: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Priority" value={p.priority} onChange={(v) => onChange({ priority: v })} />
            <Field label="Due date" value={p.due_date} onChange={(v) => onChange({ due_date: v })} />
          </div>
        </div>
      );
    case "client_cost":
      return (
        <div className="space-y-2">
          <Field label="Category" value={p.category} onChange={(v) => onChange({ category: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Amount ($)" value={p.amount} onChange={(v) => onChange({ amount: Number(v) })} />
            <Field label="Monthly?" value={String(p.is_monthly ?? true)} onChange={(v) => onChange({ is_monthly: v === "true" })} />
          </div>
        </div>
      );
    case "client_payment":
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Amount ($)" value={p.amount} onChange={(v) => onChange({ amount: Number(v) })} />
            <Field label="Year" value={p.payment_year} onChange={(v) => onChange({ payment_year: Number(v) })} />
            <Field label="Month" value={p.payment_month} onChange={(v) => onChange({ payment_month: Number(v) })} />
          </div>
          <Field label="Notes" value={p.notes} onChange={(v) => onChange({ notes: v })} />
        </div>
      );
    default:
      return <pre className="text-[10px] text-muted-foreground bg-muted/40 rounded p-2 overflow-x-auto">{JSON.stringify(p, null, 2)}</pre>;
  }
}