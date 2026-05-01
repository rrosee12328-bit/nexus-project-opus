import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Phone, Plus, Search, FileText, Mic, TrendingUp, Users,
  ChevronDown, ChevronUp, Pencil, Trash2, ExternalLink, Download, RefreshCw,
  Brain, AlertTriangle, CheckCircle2, XCircle, Link2Off,
} from "lucide-react";
import { CallSummaryMarkdown, getBriefSummary } from "@/components/admin/CallSummaryMarkdown";
// PDF generation handled server-side via edge function `generate-call-summary-pdf`

type CallRecord = {
  id: string;
  call_date: string;
  call_type: string;
  client_id: string | null;
  project_id: string | null;
  fathom_meeting_id: string | null;
  summary: string | null;
  transcript: string | null;
  sentiment: string | null;
  key_decisions: any;
  created_at: string | null;
  duration_minutes?: number | null;
  fathom_url?: string | null;
  ai_analysis?: any;
  summary_edited?: boolean;
  summary_original?: string | null;
  flagged_amounts?: Array<{ value: string; suggestion: string; context: string }> | null;
};

type Client = { id: string; name: string };
type Project = { id: string; name: string };

const CALL_TYPES = [
  { value: "discovery", label: "Discovery" },
  { value: "onboarding", label: "Onboarding" },
  { value: "check_in", label: "Check-In" },
  { value: "sales", label: "Sales" },
  { value: "internal", label: "Internal" },
  { value: "other", label: "Other" },
];

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

type FormData = {
  call_date: string;
  call_type: string;
  client_id: string;
  project_id: string;
  fathom_meeting_id: string;
  summary: string;
  transcript: string;
  sentiment: string;
  key_decisions_text: string;
};

const emptyForm = (): FormData => ({
  call_date: format(new Date(), "yyyy-MM-dd"),
  call_type: "check_in",
  client_id: "",
  project_id: "",
  fathom_meeting_id: "",
  summary: "",
  transcript: "",
  sentiment: "neutral",
  key_decisions_text: "",
});

export default function AdminCalls() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [brainFilter, setBrainFilter] = useState<"all" | "ingested" | "missing_summary" | "missing_client" | "flagged" | "edited">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCall, setEditingCall] = useState<CallRecord | null>(null);
  const [viewingCall, setViewingCall] = useState<CallRecord | null>(null);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm());

  const { data: calls = [], isLoading } = useQuery({
    queryKey: ["call-intelligence"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("call_intelligence")
        .select("*")
        .order("call_date", { ascending: false });
      if (error) throw error;
      return (data || []) as CallRecord[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return (data || []) as Client[];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-list"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id, name").order("name");
      return (data || []) as Project[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (f: FormData) => {
      const payload: any = {
        call_date: f.call_date,
        call_type: f.call_type,
        client_id: f.client_id || null,
        project_id: f.project_id || null,
        fathom_meeting_id: f.fathom_meeting_id || null,
        summary: f.summary || null,
        transcript: f.transcript || null,
        sentiment: f.sentiment || null,
        key_decisions: f.key_decisions_text
          ? f.key_decisions_text.split("\n").filter(Boolean).map((d) => d.trim())
          : null,
      };
      const { error } = await (supabase as any).from("call_intelligence").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-intelligence"] });
      toast.success("Call record added");
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, f }: { id: string; f: FormData }) => {
      // If the summary changed from what Fathom (or a previous edit) had stored,
      // mark the row as edited so future Fathom syncs don't overwrite the correction.
      const { data: existing } = await (supabase as any)
        .from("call_intelligence")
        .select("summary")
        .eq("id", id)
        .maybeSingle();
      const summaryChanged = (existing?.summary ?? "") !== (f.summary ?? "");
      const payload: any = {
        call_date: f.call_date,
        call_type: f.call_type,
        client_id: f.client_id || null,
        project_id: f.project_id || null,
        fathom_meeting_id: f.fathom_meeting_id || null,
        summary: f.summary || null,
        transcript: f.transcript || null,
        sentiment: f.sentiment || null,
        key_decisions: f.key_decisions_text
          ? f.key_decisions_text.split("\n").filter(Boolean).map((d) => d.trim())
          : null,
      };
      if (summaryChanged) {
        payload.summary_edited = true;
        payload.summary_edited_at = new Date().toISOString();
      }
      const { error } = await (supabase as any).from("call_intelligence").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-intelligence"] });
      toast.success("Call record updated");
      setDialogOpen(false);
      setEditingCall(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("call_intelligence").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-intelligence"] });
      toast.success("Call record deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    return calls.filter((c) => {
      const clientName = clients.find((cl) => cl.id === c.client_id)?.name ?? "";
      const matchesSearch =
        !search ||
        clientName.toLowerCase().includes(search.toLowerCase()) ||
        c.summary?.toLowerCase().includes(search.toLowerCase()) ||
        c.call_type.toLowerCase().includes(search.toLowerCase());
      const matchesType = filterType === "all" || c.call_type === filterType;
      const flaggedCount = Array.isArray(c.flagged_amounts) ? c.flagged_amounts.length : 0;
      const isIngested = !!c.summary && !!c.client_id;
      const matchesBrain =
        brainFilter === "all" ? true :
        brainFilter === "ingested" ? isIngested :
        brainFilter === "missing_summary" ? !c.summary :
        brainFilter === "missing_client" ? !c.client_id :
        brainFilter === "flagged" ? flaggedCount > 0 :
        brainFilter === "edited" ? !!c.summary_edited :
        true;
      return matchesSearch && matchesType && matchesBrain;
    });
  }, [calls, clients, search, filterType, brainFilter]);

  const stats = useMemo(() => ({
    total: calls.length,
    positive: calls.filter((c) => c.sentiment === "positive").length,
    withTranscript: calls.filter((c) => c.transcript).length,
    clients: new Set(calls.map((c) => c.client_id).filter(Boolean)).size,
  }), [calls]);

  const brainStats = useMemo(() => {
    const total = calls.length;
    const ingested = calls.filter((c) => !!c.summary && !!c.client_id).length;
    const missingSummary = calls.filter((c) => !c.summary).length;
    const missingClient = calls.filter((c) => !c.client_id).length;
    const flagged = calls.filter((c) => Array.isArray(c.flagged_amounts) && c.flagged_amounts.length > 0).length;
    const edited = calls.filter((c) => !!c.summary_edited).length;
    const pct = total > 0 ? Math.round((ingested / total) * 100) : 0;
    return { total, ingested, missingSummary, missingClient, flagged, edited, pct };
  }, [calls]);

  const openAdd = () => {
    setEditingCall(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (call: CallRecord) => {
    setEditingCall(call);
    const decisions = Array.isArray(call.key_decisions)
      ? call.key_decisions.join("\n")
      : typeof call.key_decisions === "string"
      ? call.key_decisions
      : "";
    setForm({
      call_date: call.call_date,
      call_type: call.call_type,
      client_id: call.client_id ?? "",
      project_id: call.project_id ?? "",
      fathom_meeting_id: call.fathom_meeting_id ?? "",
      summary: call.summary ?? "",
      transcript: call.transcript ?? "",
      sentiment: call.sentiment ?? "neutral",
      key_decisions_text: decisions,
    });
    setDialogOpen(true);
  };

  const openView = (call: CallRecord) => {
    setViewingCall(call);
    setTranscriptExpanded(false);
  };

  const handleSubmit = () => {
    if (editingCall) {
      updateMutation.mutate({ id: editingCall.id, f: form });
    } else {
      addMutation.mutate(form);
    }
  };

  const getClientName = (id: string | null) =>
    id ? (clients.find((c) => c.id === id)?.name ?? "—") : "—";

  const getProjectName = (id: string | null) =>
    id ? (projects.find((p) => p.id === id)?.name ?? "—") : "—";

  const handleDownloadPdf = async (call: CallRecord) => {
    const toastId = toast.loading("Generating PDF…");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/generate-call-summary-pdf?call_id=${encodeURIComponent(call.id)}`;

      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }

      const blob = await res.blob();
      // Filename from header if present
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] ?? `call-summary-${call.call_date.slice(0, 10)}.pdf`;

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);

      toast.success("PDF downloaded", { id: toastId });
    } catch (e: any) {
      toast.error(e.message || "Failed to generate PDF", { id: toastId });
    }
  };

  const syncFathom = async (opts: { call_id?: string; sync_all_missing?: boolean }) => {
    const toastId = toast.loading(opts.sync_all_missing ? "Syncing missing calls from Fathom…" : "Syncing from Fathom…");
    try {
      const { data, error } = await supabase.functions.invoke("fathom-sync", { body: opts });
      if (error) throw error;
      const results = (data as any)?.results ?? [];
      const updated = results.filter((r: any) => !r.error && (r.updated?.length ?? 0) > 0).length;
      const errored = results.filter((r: any) => r.error).length;
      toast.success(
        `Synced ${updated} call${updated === 1 ? "" : "s"}${errored ? ` (${errored} failed)` : ""}`,
        { id: toastId },
      );
      queryClient.invalidateQueries({ queryKey: ["call-intelligence"] });
    } catch (e: any) {
      toast.error(e.message || "Fathom sync failed", { id: toastId });
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Call Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All Fathom, Retell, and manual call records linked to clients and projects.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => syncFathom({ sync_all_missing: true })} title="Pull share URLs & transcripts from Fathom for calls missing them">
            <RefreshCw className="h-4 w-4 mr-2" /> Sync from Fathom
          </Button>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" /> Log Call
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Calls", value: stats.total, icon: Phone, color: "text-primary" },
          { label: "Positive Sentiment", value: stats.positive, icon: TrendingUp, color: "text-emerald-400" },
          { label: "With Transcript", value: stats.withTranscript, icon: Mic, color: "text-blue-400" },
          { label: "Clients Covered", value: stats.clients, icon: Users, color: "text-purple-400" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-2xl font-semibold mt-1">{s.value}</p>
                  </div>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Brain Ingestion Dashboard */}
      <Card className="border-primary/20">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Brain Ingestion</h2>
                <p className="text-xs text-muted-foreground">
                  Calls the AI agent can read via <code className="text-[11px] px-1 py-0.5 rounded bg-muted">query_calls</code>.
                  A call is fully ingested when it has both a summary and a linked client.
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold tabular-nums">
                {brainStats.ingested}<span className="text-muted-foreground text-base font-normal"> / {brainStats.total}</span>
              </div>
              <p className="text-xs text-muted-foreground">{brainStats.pct}% ingested</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden mb-4">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${brainStats.pct}%` }}
            />
          </div>

          {/* Filter chips */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {[
              { key: "ingested" as const, label: "Ingested", value: brainStats.ingested, icon: CheckCircle2, color: "text-emerald-500", border: "border-emerald-500/30 bg-emerald-500/5" },
              { key: "missing_summary" as const, label: "Missing summary", value: brainStats.missingSummary, icon: XCircle, color: "text-red-500", border: "border-red-500/30 bg-red-500/5" },
              { key: "missing_client" as const, label: "Unlinked client", value: brainStats.missingClient, icon: Link2Off, color: "text-amber-500", border: "border-amber-500/30 bg-amber-500/5" },
              { key: "flagged" as const, label: "Flagged amounts", value: brainStats.flagged, icon: AlertTriangle, color: "text-amber-500", border: "border-amber-500/30 bg-amber-500/5" },
              { key: "edited" as const, label: "Manually corrected", value: brainStats.edited, icon: Pencil, color: "text-blue-500", border: "border-blue-500/30 bg-blue-500/5" },
            ].map((c) => {
              const active = brainFilter === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setBrainFilter(active ? "all" : c.key)}
                  className={`text-left rounded-lg border p-3 transition-all hover:scale-[1.02] ${
                    active ? "border-primary bg-primary/10 ring-1 ring-primary" : c.border
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <c.icon className={`h-4 w-4 ${c.color}`} />
                    <span className="text-lg font-semibold tabular-nums">{c.value}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">{c.label}</p>
                </button>
              );
            })}
          </div>

          {brainFilter !== "all" && (
            <div className="mt-3 flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                Showing <span className="font-medium text-foreground">{filtered.length}</span> filtered call{filtered.length === 1 ? "" : "s"}.
              </span>
              <button
                type="button"
                onClick={() => setBrainFilter("all")}
                className="text-primary hover:underline"
              >
                Clear filter
              </button>
            </div>
          )}

          {(brainStats.missingSummary > 0 || brainStats.missingClient > 0) && (
            <div className="mt-3 flex items-center justify-between gap-2 text-xs rounded-md border border-dashed border-border p-2">
              <span className="text-muted-foreground">
                {brainStats.missingSummary > 0 && <>⚠ {brainStats.missingSummary} call{brainStats.missingSummary === 1 ? "" : "s"} missing summary. </>}
                {brainStats.missingClient > 0 && <>⚠ {brainStats.missingClient} call{brainStats.missingClient === 1 ? "" : "s"} not linked to a client. </>}
                Run a Fathom sync to backfill.
              </span>
              <Button size="sm" variant="outline" onClick={() => syncFathom({ sync_all_missing: true })}>
                <RefreshCw className="h-3 w-3 mr-1" /> Sync missing
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search calls…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {CALL_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading calls…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">
              No call records found. Click "Log Call" to add one.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Sentiment</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Src</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((call) => (
                  <TableRow
                    key={call.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => openView(call)}
                  >
                    <TableCell className="text-xs">
                      {format(parseISO(call.call_date), "MM/dd/yy")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={TYPE_COLORS[call.call_type] ?? TYPE_COLORS.other}>
                        {CALL_TYPES.find((t) => t.value === call.call_type)?.label ?? call.call_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{getClientName(call.client_id)}</TableCell>
                    <TableCell className="text-sm">{getProjectName(call.project_id)}</TableCell>
                    <TableCell>
                      {call.sentiment ? (
                        <Badge variant="outline" className={SENTIMENT_COLORS[call.sentiment] ?? SENTIMENT_COLORS.neutral}>
                          {call.sentiment}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm max-w-[280px] truncate">
                      {getBriefSummary(call.summary, 120) || "—"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {(call.fathom_url || call.fathom_meeting_id) ? (
                        <a
                          href={call.fathom_url || `https://fathom.video/calls/${call.fathom_meeting_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          title="Open in Fathom"
                        >
                          <ExternalLink className="h-3 w-3" /> Fathom
                        </a>
                      ) : call.transcript ? (
                        <Badge variant="outline" className="text-xs">
                          <FileText className="h-3 w-3" />
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Download PDF" onClick={() => handleDownloadPdf(call)}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(call)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteMutation.mutate(call.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewingCall} onOpenChange={(o) => !o && setViewingCall(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {viewingCall && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  {CALL_TYPES.find((t) => t.value === viewingCall.call_type)?.label ?? viewingCall.call_type} Call
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
                    {CALL_TYPES.find((t) => t.value === viewingCall.call_type)?.label}
                  </Badge>
                  {viewingCall.client_id && <Badge variant="outline">{getClientName(viewingCall.client_id)}</Badge>}
                  {viewingCall.project_id && <Badge variant="outline">{getProjectName(viewingCall.project_id)}</Badge>}
                  {(viewingCall.fathom_url || viewingCall.fathom_meeting_id) && (
                    <a
                      href={viewingCall.fathom_url || `https://fathom.video/calls/${viewingCall.fathom_meeting_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> View in Fathom
                    </a>
                  )}
                  {viewingCall.fathom_meeting_id && (
                    <button
                      type="button"
                      onClick={() => syncFathom({ call_id: viewingCall.id })}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      title="Pull share URL & transcript from Fathom"
                    >
                      <RefreshCw className="h-3 w-3" /> Sync from Fathom
                    </button>
                  )}
                </div>
                {viewingCall.summary && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold">Summary</h3>
                      <div className="flex items-center gap-2">
                        {(viewingCall as any).summary_edited && (
                          <Badge variant="outline" className="text-[10px]">Edited</Badge>
                        )}
                        {(viewingCall as any).summary_edited &&
                          (viewingCall as any).summary_original &&
                          (viewingCall as any).summary_original !== viewingCall.summary && (
                          <button
                            type="button"
                            onClick={async () => {
                              const orig = (viewingCall as any).summary_original as string;
                              const { error } = await (supabase as any)
                                .from("call_intelligence")
                                .update({ summary: orig, summary_edited: false, summary_edited_at: null })
                                .eq("id", viewingCall.id);
                              if (error) { toast.error(error.message); return; }
                              toast.success("Reverted to Fathom's original summary");
                              queryClient.invalidateQueries({ queryKey: ["call-intelligence"] });
                              setViewingCall({ ...viewingCall, summary: orig, summary_edited: false } as any);
                            }}
                            className="text-xs text-primary hover:underline"
                          >
                            Revert to Fathom original
                          </button>
                        )}
                      </div>
                    </div>
                    {Array.isArray((viewingCall as any).flagged_amounts) && (viewingCall as any).flagged_amounts.length > 0 && (
                      <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                        <div className="font-semibold text-amber-700 dark:text-amber-400 mb-1">
                          ⚠ Possible transcription errors detected
                        </div>
                        <ul className="space-y-1 text-foreground/80">
                          {((viewingCall as any).flagged_amounts as Array<{ value: string; suggestion: string; context: string }>).map((f, i) => (
                            <li key={i}>
                              <span className="font-mono font-semibold">{f.value}</span> — {f.suggestion}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-2 text-foreground/60">
                          Click <span className="font-semibold">Edit</span> below to correct the summary. Future Fathom syncs won't overwrite your edits.
                        </div>
                      </div>
                    )}
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
                {viewingCall.key_decisions && (
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Key Decisions</h3>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {(Array.isArray(viewingCall.key_decisions) ? viewingCall.key_decisions : [viewingCall.key_decisions]).map((d: string, i: number) => (
                        <li key={i} className="flex gap-2">
                          <span>•</span><span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
                        {viewingCall.transcript}
                      </pre>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => handleDownloadPdf(viewingCall)}>
                  <Download className="h-4 w-4 mr-2" /> Download PDF
                </Button>
                <Button variant="outline" onClick={() => openEdit(viewingCall)}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </Button>
                <Button onClick={() => setViewingCall(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCall ? "Edit Call Record" : "Log Call"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.call_date} onChange={(e) => setForm({ ...form, call_date: e.target.value })} />
              </div>
              <div>
                <Label>Call Type</Label>
                <Select value={form.call_type} onValueChange={(v) => setForm({ ...form, call_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CALL_TYPES.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Client</Label>
                <Select value={form.client_id || "none"} onValueChange={(v) => setForm({ ...form, client_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {clients.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Project</Label>
                <Select value={form.project_id || "none"} onValueChange={(v) => setForm({ ...form, project_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {projects.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Sentiment</Label>
                <Select value={form.sentiment} onValueChange={(v) => setForm({ ...form, sentiment: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["positive", "neutral", "negative", "mixed"].map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fathom Meeting ID <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Input value={form.fathom_meeting_id} onChange={(e) => setForm({ ...form, fathom_meeting_id: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Summary</Label>
              <Textarea rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </div>
            <div>
              <Label>Key Decisions <span className="text-xs text-muted-foreground">(one per line)</span></Label>
              <Textarea rows={3} placeholder={"Client approved Phase 2 scope\nNext meeting set for May 15"} value={form.key_decisions_text} onChange={(e) => setForm({ ...form, key_decisions_text: e.target.value })} />
            </div>
            <div>
              <Label>Transcript <span className="text-xs text-muted-foreground">(optional — paste full transcript)</span></Label>
              <Textarea rows={5} placeholder="Paste the full call transcript here…" value={form.transcript} onChange={(e) => setForm({ ...form, transcript: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={addMutation.isPending || updateMutation.isPending}>
              {editingCall ? "Update" : "Save Call"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}