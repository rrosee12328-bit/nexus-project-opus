import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Brain,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  X,
  Sparkles,
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

interface BrainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialInput?: string;
}

export function BrainDialog({ open, onOpenChange, initialInput = "" }: BrainDialogProps) {
  const [input, setInput] = useState(initialInput);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [actions, setActions] = useState<Action[] | null>(null);
  const [clients, setClients] = useState<ClientLite[]>([]);

  useEffect(() => {
    if (!open) return;
    setInput(initialInput);
    setActions(null);
    supabase
      .from("clients")
      .select("id, name")
      .order("name")
      .then(({ data }) => setClients((data as ClientLite[]) ?? []));
  }, [open, initialInput]);

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
    // Validate: every non-company action must have a client_id
    const missing = actions.filter(
      (a) =>
        !["company_summary", "client_preference"].includes(a.kind) && !a.client_id
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
        onOpenChange(false);
      } else {
        toast.warning(`${ok} saved, ${fail} failed`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setCommitting(false);
    }
  };

  const updateAction = (i: number, patch: Partial<Action>) => {
    setActions((prev) => prev && prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  };

  const removeAction = (i: number) => {
    setActions((prev) => prev?.filter((_, idx) => idx !== i) ?? null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" />
            Brain
          </DialogTitle>
          <DialogDescription className="text-xs">
            Dump any context. The brain figures out where it goes across the platform.
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 pb-3 border-b border-border space-y-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. 'Acme wants to add Instagram, push their next call to June 12, and prefers Tuesdays'"
            className="min-h-[90px] text-sm resize-none"
            maxLength={5000}
            disabled={loading || committing}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                if (input.trim() && !loading) analyze();
              }
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {input.length}/5000 · ⌘/Ctrl + Enter
            </span>
            <Button size="sm" onClick={analyze} disabled={!input.trim() || loading || committing}>
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Analyze
                </>
              )}
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 max-h-[50vh]">
          <div className="p-5 space-y-3">
            {actions === null && !loading && (
              <div className="text-center py-10 text-xs text-muted-foreground">
                <Brain className="h-8 w-8 mx-auto opacity-30 mb-2" />
                <p>The brain will route your dump into structured actions.</p>
                <p className="mt-1 text-muted-foreground/60">
                  You'll review and confirm before anything is saved.
                </p>
              </div>
            )}

            {actions?.length === 0 && (
              <div className="text-center py-8 text-xs text-muted-foreground">
                Nothing detected. Try giving more context (who, what, when).
              </div>
            )}

            {actions?.map((a, i) => {
              const needsClient = !["company_summary", "client_preference"].includes(a.kind);
              const noClientResolved = needsClient && !a.client_id;
              const lowConfidence = a.confidence < 0.7;
              return (
                <div
                  key={i}
                  className="rounded-lg border border-border bg-card p-3 space-y-2 relative"
                >
                  <button
                    onClick={() => removeAction(i)}
                    className="absolute top-2 right-2 p-1 rounded hover:bg-muted text-muted-foreground"
                    title="Skip this action"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <div className="flex items-center gap-2 flex-wrap pr-6">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${KIND_COLOR[a.kind] ?? ""}`}>
                      {KIND_LABEL[a.kind] ?? a.kind}
                    </Badge>
                    {lowConfidence && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-700 border-amber-500/30">
                        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                        Confirm
                      </Badge>
                    )}
                    {!lowConfidence && !noClientResolved && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                        High confidence
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground/70">
                      {Math.round(a.confidence * 100)}%
                    </span>
                  </div>

                  {/* Client picker (when relevant) */}
                  {needsClient || a.kind === "client_preference" ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        Client
                      </span>
                      <select
                        value={a.client_id ?? ""}
                        onChange={(e) =>
                          updateAction(i, { client_id: e.target.value || null })
                        }
                        className={`flex-1 h-7 text-xs rounded border bg-background px-2 ${
                          noClientResolved ? "border-amber-500/50" : "border-border"
                        }`}
                      >
                        <option value="">
                          {a.kind === "client_preference" ? "— Global preference —" : "— Select client —"}
                        </option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {/* Editable payload preview */}
                  <PayloadEditor action={a} onChange={(patch) => updateAction(i, { payload: { ...a.payload, ...patch } })} />

                  {a.reason && (
                    <p className="text-[10px] text-muted-foreground/60 italic pt-1 border-t border-border/40">
                      {a.reason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {actions && actions.length > 0 && (
          <div className="p-4 border-t border-border flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {actions.length} action{actions.length === 1 ? "" : "s"} ready
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setActions(null)} disabled={committing}>
                Discard
              </Button>
              <Button size="sm" onClick={commit} disabled={committing}>
                {committing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    Confirm & route <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
        <Input value={value ?? ""} onChange={(e) => oc(e.target.value)} className="h-7 text-xs" />
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