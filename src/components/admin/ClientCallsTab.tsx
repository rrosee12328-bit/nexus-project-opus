import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Phone, Mic, FileText, ChevronDown, ChevronUp, ExternalLink, Brain } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CallSummaryMarkdown, getBriefSummary, unwrapTranscript, extractKeyTakeaways } from "@/components/admin/CallSummaryMarkdown";

type CallRecord = {
  id: string;
  call_date: string;
  call_type: string;
  client_id: string | null;
  project_id: string | null;
  fathom_meeting_id: string | null;
  fathom_url?: string | null;
  summary: string | null;
  transcript: string | null;
  sentiment: string | null;
  key_decisions: any;
  created_at: string | null;
};

const extractFathomUrl = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/https:\/\/fathom\.video\/[^\s)\]]+/i);
  return match?.[0] ?? null;
};

const getFathomUrl = (call: CallRecord) => (
  call.fathom_url
  || extractFathomUrl(call.summary)
  || extractFathomUrl(call.transcript)
  || (call.fathom_meeting_id ? `https://fathom.video/calls/${call.fathom_meeting_id}` : null)
);

const normalizeDecisions = (raw: any): string[] => {
  if (!raw) return [];
  let val: any = raw;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return [];
    try { val = JSON.parse(trimmed); }
    catch { return [trimmed]; }
  }
  if (Array.isArray(val)) {
    return val.map((d) => (typeof d === "string" ? d.trim() : String(d))).filter(Boolean);
  }
  const s = String(val).trim();
  return s ? [s] : [];
};

const CALL_TYPES: Record<string, string> = {
  discovery: "Discovery",
  onboarding: "Onboarding",
  check_in: "Check-In",
  sales: "Sales",
  internal: "Internal",
  other: "Other",
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  neutral: "bg-muted text-muted-foreground border-border",
  negative: "bg-red-500/20 text-red-400 border-red-500/30",
  mixed: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

const TYPE_COLORS: Record<string, string> = {
  discovery: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  onboarding: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  check_in: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  sales: "bg-green-500/20 text-green-400 border-green-500/30",
  internal: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  other: "bg-muted text-muted-foreground border-border",
};

export default function ClientCallsTab({ clientId }: { clientId: string }) {
  const [viewingCall, setViewingCall] = useState<CallRecord | null>(null);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const queryClient = useQueryClient();

  const analyzeCall = async (callId: string) => {
    const toastId = toast.loading("Analyzing call with AI…");
    try {
      const { data, error } = await supabase.functions.invoke("analyze-call", { body: { call_id: callId } });
      if (error) throw error;
      const c = (data as any)?.created;
      toast.success(`Analyzed — ${c?.tasks ?? 0} task(s) created${c?.note ? ", note added" : ""}`, { id: toastId });
      queryClient.invalidateQueries({ queryKey: ["call-intelligence", "client", clientId] });
      queryClient.invalidateQueries({ queryKey: ["client-notes", clientId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (e: any) {
      toast.error(e.message || "Analyze failed", { id: toastId });
    }
  };

  const { data: calls = [], isLoading } = useQuery({
    queryKey: ["call-intelligence", "client", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("call_intelligence")
        .select("*")
        .eq("client_id", clientId)
        .order("call_date", { ascending: false });
      if (error) throw error;
      return (data || []) as CallRecord[];
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading calls…</CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4" />
            Call Intelligence
            <Badge variant="outline" className="ml-1">{calls.length}</Badge>
          </CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/calls">View All Calls</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {calls.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No calls recorded for this client yet.
            </p>
          ) : (
            <div className="space-y-2">
              {calls.map((call) => {
                const fathomUrl = getFathomUrl(call);

                return (
                  <div
                    key={call.id}
                    className="flex gap-3 p-3 rounded-md border border-border hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() => { setViewingCall(call); setTranscriptExpanded(false); }}
                  >
                  <div className="mt-0.5">
                    {call.fathom_meeting_id ? (
                      <Mic className="h-4 w-4 text-blue-400" />
                    ) : call.transcript ? (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Phone className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={TYPE_COLORS[call.call_type] ?? TYPE_COLORS.other}>
                        {CALL_TYPES[call.call_type] ?? call.call_type}
                      </Badge>
                      {call.sentiment && (
                        <Badge variant="outline" className={SENTIMENT_COLORS[call.sentiment] ?? SENTIMENT_COLORS.neutral}>
                          {call.sentiment}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(call.call_date), "MMM d, yyyy")}
                      </span>
                    </div>
                    {call.summary && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {getBriefSummary(call.summary, 180)}
                      </p>
                    )}
                    {fathomUrl && (
                      <a
                        href={fathomUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                      >
                        <ExternalLink className="h-3 w-3" /> Open in Fathom
                      </a>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewingCall} onOpenChange={(o) => !o && setViewingCall(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {viewingCall && (
            <>
              {(() => {
                const fathomUrl = getFathomUrl(viewingCall);

                return (
                  <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  {CALL_TYPES[viewingCall.call_type] ?? viewingCall.call_type} Call
                  <span className="text-sm font-normal text-muted-foreground">
                    — {format(parseISO(viewingCall.call_date), "MMMM d, yyyy")}
                  </span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {viewingCall.sentiment && (
                    <Badge variant="outline" className={SENTIMENT_COLORS[viewingCall.sentiment] ?? SENTIMENT_COLORS.neutral}>
                      {viewingCall.sentiment}
                    </Badge>
                  )}
                  <Badge variant="outline" className={TYPE_COLORS[viewingCall.call_type] ?? TYPE_COLORS.other}>
                    {CALL_TYPES[viewingCall.call_type]}
                  </Badge>
                  {fathomUrl && (
                    <a
                      href={fathomUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> View in Fathom
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => analyzeCall(viewingCall.id)}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Brain className="h-3 w-3" /> Analyze with AI
                  </button>
                </div>
                {viewingCall.summary && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Summary</h3>
                    <p className="text-sm text-foreground/90 leading-relaxed mb-3">
                      {getBriefSummary(viewingCall.summary) || "—"}
                    </p>
                    <details className="rounded-lg border border-border bg-card">
                      <summary className="cursor-pointer text-xs font-medium text-muted-foreground px-4 py-2 hover:text-foreground">
                        Show full breakdown
                      </summary>
                      <div className="px-4 pb-4 pt-1">
                        <CallSummaryMarkdown content={viewingCall.summary} />
                      </div>
                    </details>
                  </div>
                )}
                {(() => {
                  let decisions = normalizeDecisions(viewingCall.key_decisions);
                  if (decisions.length === 0) {
                    decisions = extractKeyTakeaways(viewingCall.summary);
                  }
                  if (decisions.length === 0) return null;
                  return (
                    <div>
                      <h3 className="text-sm font-semibold mb-1">Key Takeaways</h3>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {decisions.map((d, i) => (
                          <li key={i} className="flex gap-2">
                            <span>•</span>
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
                {viewingCall.transcript && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setTranscriptExpanded((v) => !v)}
                      className="inline-flex items-center gap-2 text-sm font-semibold hover:text-primary"
                    >
                      <FileText className="h-4 w-4" />
                      Transcript
                      {transcriptExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {transcriptExpanded && (
                      <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap bg-muted/40 rounded p-3 max-h-[300px] overflow-y-auto">
                        {unwrapTranscript(viewingCall.transcript)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={() => setViewingCall(null)}>Close</Button>
              </DialogFooter>
                  </>
                );
              })()}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}