import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain,
  AlertTriangle,
  TrendingDown,
  MessageSquareDashed,
  Eye,
  Clock,
  Check,
  X,
  RefreshCw,
  ChevronRight,
  CircleSlash,
  Sparkles,
  History,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DecisionsHistoryDialog } from "./DecisionsHistoryDialog";

type Decision = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  recommendation: string | null;
  context: Record<string, any> | null;
  risk_tier: "low" | "medium" | "high";
  status: string;
  client_id: string | null;
  link: string | null;
  created_at: string;
};

const TYPE_META: Record<string, { icon: typeof Brain; label: string }> = {
  margin_breach: { icon: TrendingDown, label: "Margin breach" },
  low_margin: { icon: AlertTriangle, label: "Low margin" },
  communication_gap: { icon: MessageSquareDashed, label: "Comm gap" },
  proposal_warm_lead: { icon: Eye, label: "Warm lead" },
  overdue_critical_task: { icon: Clock, label: "Overdue" },
};

const RISK_STYLE: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-warning/10 text-warning border-warning/30",
  low: "bg-muted text-muted-foreground border-border",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function DecisionsPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_decision_queue")
      .select("*")
      .eq("status", "pending")
      .order("risk_tier", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(15);
    if (error) console.error(error);
    setDecisions((data ?? []) as Decision[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("decision-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_decision_queue" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const runWatcher = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-watcher", { body: {} });
      if (error) throw error;
      toast.success(
        `Watcher ran: ${data?.decisions_inserted ?? 0} new decision${
          data?.decisions_inserted === 1 ? "" : "s"
        }`,
      );
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Watcher failed");
    } finally {
      setRunning(false);
    }
  };

  const resolve = async (id: string, status: "approved" | "rejected" | "dismissed") => {
    setResolving(id);
    const { error } = await supabase
      .from("ai_decision_queue")
      .update({
        status,
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id ?? null,
      })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      const verb = status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "Dismissed";
      toast.success(`${verb}`);
      setDecisions((prev) => prev.filter((d) => d.id !== id));
    }
    setResolving(null);
  };

  // Rejection learning dialog
  const [rejectTarget, setRejectTarget] = useState<Decision | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [savingReject, setSavingReject] = useState(false);

  const submitRejection = async () => {
    if (!rejectTarget) return;
    setSavingReject(true);
    try {
      // Save preference so the AI learns
      const reason = rejectReason.trim();
      const rule = reason
        ? reason
        : `Don't flag "${rejectTarget.title}" again — admin rejected this signal.`;

      await supabase.from("ai_preferences").insert({
        scope: rejectTarget.client_id ? "client" : "category",
        scope_id: rejectTarget.client_id ?? null,
        category: rejectTarget.type,
        rule,
        reason: reason || null,
        source_decision_id: rejectTarget.id,
        created_by: user?.id ?? null,
      });

      await resolve(rejectTarget.id, "rejected");
      setRejectTarget(null);
      setRejectReason("");
      toast.success("Got it — the AI will remember this");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSavingReject(false);
    }
  };

  const counts = {
    high: decisions.filter((d) => d.risk_tier === "high").length,
    medium: decisions.filter((d) => d.risk_tier === "medium").length,
    low: decisions.filter((d) => d.risk_tier === "low").length,
  };

  const askAI = (d: Decision) => {
    const meta = TYPE_META[d.type];
    const prompt = `The watcher flagged this decision: "${d.title}".\n\n` +
      (d.body ? `Context: ${d.body}\n\n` : "") +
      (d.recommendation ? `Suggested action: ${d.recommendation}\n\n` : "") +
      `Help me decide what to actually do here. Pull the latest data, weigh the trade-offs, and propose a concrete next step. If you're confident, draft it.`;
    navigate("/admin/agent", {
      state: {
        initialPrompt: prompt,
        entityType: d.client_id ? "client" : "decision",
        entityId: d.client_id ?? d.id,
        entityName: d.title,
        page: "Brain Hub · Decisions",
      },
    });
  };

  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Decisions queue
            {decisions.length > 0 && (
              <Badge variant="outline" className="ml-1 font-mono text-xs">
                {decisions.length}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {counts.high > 0 && (
              <Badge className={`${RISK_STYLE.high} font-mono text-xs`}>
                <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-destructive" />
                {counts.high} high
              </Badge>
            )}
            {counts.medium > 0 && (
              <Badge className={`${RISK_STYLE.medium} font-mono text-xs`}>{counts.medium} med</Badge>
            )}
            {counts.low > 0 && (
              <Badge className={`${RISK_STYLE.low} font-mono text-xs`}>{counts.low} low</Badge>
            )}
            <Button onClick={() => setHistoryOpen(true)} variant="ghost" size="sm">
              <History className="h-3.5 w-3.5" />
              <span className="ml-1.5 hidden sm:inline">History</span>
            </Button>
            <Button onClick={runWatcher} variant="outline" size="sm" disabled={running}>
              <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
              <span className="ml-1.5 hidden sm:inline">Scan now</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : decisions.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-md">
            <Check className="h-8 w-8 mx-auto mb-2 opacity-50" />
            All clear. The AI will scan your business every few hours and queue decisions here.
          </div>
        ) : (
          <div className="space-y-2">
            {decisions.map((d) => {
              const meta = TYPE_META[d.type] ?? { icon: Brain, label: d.type };
              const Icon = meta.icon;
              const isResolving = resolving === d.id;
              return (
                <div
                  key={d.id}
                  className={`group rounded-md border bg-card p-3 transition-colors hover:border-primary/40 ${
                    d.risk_tier === "high"
                      ? "border-l-4 border-l-destructive"
                      : d.risk_tier === "medium"
                        ? "border-l-4 border-l-warning"
                        : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Icon className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium leading-tight">{d.title}</span>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {meta.label}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(d.created_at)}</span>
                      </div>
                      {d.body && (
                        <p className="mt-1 text-xs text-muted-foreground break-words">{d.body}</p>
                      )}
                      {d.recommendation && (
                        <p className="mt-1.5 text-xs">
                          <span className="font-medium text-primary">→ </span>
                          {d.recommendation}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {d.link && (
                          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                            <Link to={d.link}>
                              Open <ChevronRight className="ml-0.5 h-3 w-3" />
                            </Link>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-primary hover:text-primary"
                          onClick={() => askAI(d)}
                          disabled={isResolving}
                        >
                          <Sparkles className="h-3.5 w-3.5 mr-1" /> Ask AI
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-emerald-600 hover:text-emerald-700"
                          disabled={isResolving}
                          onClick={() => resolve(d.id, "approved")}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" /> Acted on it
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={isResolving}
                          onClick={() => resolve(d.id, "dismissed")}
                        >
                          <CircleSlash className="h-3.5 w-3.5 mr-1" /> Not now
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          disabled={isResolving}
                          onClick={() => setRejectTarget(d)}
                        >
                          <X className="h-3.5 w-3.5 mr-1" /> Wrong call
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>

    <DecisionsHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />

    <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectReason(""); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Teach the AI</DialogTitle>
          <DialogDescription>
            Why was this the wrong call? Your reason becomes a rule the AI follows next time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reject-reason" className="text-xs">Reason (optional)</Label>
          <Textarea
            id="reject-reason"
            placeholder={rejectTarget?.client_id
              ? `e.g. This client is a strategic loss leader — don't flag low margin.`
              : `e.g. We don't care about this signal type.`}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to just dismiss without explanation.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setRejectTarget(null)} disabled={savingReject}>Cancel</Button>
          <Button onClick={submitRejection} disabled={savingReject}>
            {savingReject ? "Saving…" : "Save & reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}