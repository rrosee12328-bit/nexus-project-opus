import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Brain,
  Mail,
  Phone,
  Video,
  FileText,
  Users,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Activity,
  Clock,
  RefreshCw,
  Zap,
  UserPlus,
  FolderKanban,
  Inbox,
  Briefcase,
  Globe,
  Play,
  ExternalLink,
  TrendingDown,
  Lightbulb,
  Target,
} from "lucide-react";
import { toast } from "sonner";

type ClientLite = { id: string; name: string; client_number: string | null };

interface FeedItem {
  id: string;
  ts: string;
  source: "email" | "call" | "content" | "proposal" | "client" | "lead" | "project";
  title: string;
  summary: string;
  client?: ClientLite | null;
  link?: string;
}

interface ActionItem {
  id: string;
  source: "email";
  title: string;
  detail: string;
  client?: ClientLite | null;
  ts: string;
  urgency: number;
}

interface PipelineStatus {
  name: string;
  icon: typeof Mail;
  lastRan: string | null;
  ok: boolean;
}

interface MarketInsight {
  title: string;
  type: "opportunity" | "risk" | "trend" | "competitor" | string;
  insight?: string;
  summary?: string;
  recommended_action?: string;
  urgency: "high" | "medium" | "low" | string;
  sources?: { title?: string; url: string }[] | string[];
}

interface MarketReport {
  id: string;
  generated_at: string;
  insights: MarketInsight[];
  client_id?: string | null;
  client_name?: string | null;
  client_number?: string | null;
  report_type?: "agency" | "client" | string;
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const SOURCE_META: Record<FeedItem["source"], { icon: typeof Mail; tone: string; label: string }> = {
  email:    { icon: Mail,        tone: "text-primary",        label: "Email" },
  call:     { icon: Phone,       tone: "text-purple-500",     label: "Call" },
  content:  { icon: Video,       tone: "text-pink-500",       label: "Content" },
  proposal: { icon: FileText,    tone: "text-yellow-500",     label: "Proposal" },
  client:   { icon: UserPlus,    tone: "text-green-500",      label: "Client" },
  lead:     { icon: TrendingUp,  tone: "text-orange-500",     label: "Lead" },
  project:  { icon: FolderKanban,tone: "text-blue-500",       label: "Project" },
};

export default function BrainHub() {
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [kpis, setKpis] = useState({
    activeClients: 0,
    openProposals: 0,
    leadsInPipeline: 0,
    hoursThisMonth: 0,
    contentPublished: 0,
    emailsAwaiting: 0,
  });
  const [pipelines, setPipelines] = useState<PipelineStatus[]>([]);
  const [marketReport, setMarketReport] = useState<MarketReport | null>(null);
  const [clientReports, setClientReports] = useState<MarketReport[]>([]);
  const [marketRunning, setMarketRunning] = useState(false);
  const [clientRunning, setClientRunning] = useState(false);
  const [marketTab, setMarketTab] = useState<"agency" | "client">("agency");
  const [marketRunStatus, setMarketRunStatus] = useState<{
    type: "success" | "error";
    message: string;
    detail?: string;
  } | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      emailsRes, callsRes, contentRes, proposalsRes, leadsRes, clientsRes, projectsRes,
      activeClientsRes, openProposalsRes, leadsCountRes, hoursRes, contentPubRes, emailsActionRes,
      lastEmailRes, lastCallRes, lastContentRes,
    ] = await Promise.all([
      supabase.from("email_intelligence")
        .select("id, subject, summary, from_name, from_email, processed_at, action_required, client_id, clients(id, name, client_number)")
        .gte("processed_at", since24h).order("processed_at", { ascending: false }).limit(20),
      supabase.from("call_intelligence")
        .select("id, summary, sentiment, call_date, created_at, client_id, clients(id, name, client_number)")
        .gte("created_at", since24h).order("created_at", { ascending: false }).limit(20),
      supabase.from("content_assets")
        .select("id, title, status, content_type, updated_at, client_id, clients(id, name, client_number)")
        .gte("updated_at", since24h).order("updated_at", { ascending: false }).limit(20),
      supabase.from("proposals")
        .select("id, project_name, client_name, status, updated_at, client_id, clients!proposals_client_id_fkey(id, name, client_number)")
        .gte("updated_at", since24h).order("updated_at", { ascending: false }).limit(20),
      supabase.from("leads").select("id, name, company, status, created_at")
        .gte("created_at", since24h).order("created_at", { ascending: false }).limit(20),
      supabase.from("clients").select("id, name, client_number, status, created_at")
        .gte("created_at", since24h).order("created_at", { ascending: false }).limit(20),
      supabase.from("projects").select("id, name, current_phase, updated_at, client_id, clients(id, name, client_number)")
        .gte("updated_at", since24h).order("updated_at", { ascending: false }).limit(20),

      supabase.from("clients").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("proposals").select("id", { count: "exact", head: true }).not("status", "in", "(paid,cancelled)"),
      supabase.from("leads").select("id", { count: "exact", head: true }).not("status", "eq", "converted"),
      supabase.from("timesheets").select("hours").eq("billable", true).gte("date", startOfMonth.toISOString().split("T")[0]),
      supabase.from("content_assets").select("id", { count: "exact", head: true }).eq("status", "published"),
      supabase.from("email_intelligence").select("id", { count: "exact", head: true }).eq("action_required", true),

      supabase.from("email_intelligence").select("processed_at").order("processed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("call_intelligence").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("content_assets").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    // Build feed
    const items: FeedItem[] = [];
    (emailsRes.data || []).forEach((e: any) => items.push({
      id: `email-${e.id}`, ts: e.processed_at, source: "email",
      title: `Email from ${e.from_name || e.from_email}`,
      summary: e.summary || e.subject || "(no subject)",
      client: e.clients, link: "/ops/email-intelligence",
    }));
    (callsRes.data || []).forEach((c: any) => items.push({
      id: `call-${c.id}`, ts: c.created_at, source: "call",
      title: `Call processed${c.sentiment ? ` · ${c.sentiment}` : ""}`,
      summary: cleanSummary(c.summary) || "Call transcript ready",
      client: c.clients, link: "/admin/calls",
    }));
    (contentRes.data || []).forEach((a: any) => items.push({
      id: `content-${a.id}`, ts: a.updated_at, source: "content",
      title: `${a.content_type} · ${a.status}`,
      summary: a.title, client: a.clients, link: "/admin/business-media",
    }));
    (proposalsRes.data || []).forEach((p: any) => items.push({
      id: `prop-${p.id}`, ts: p.updated_at, source: "proposal",
      title: `Proposal ${p.status}`,
      summary: p.project_name || p.client_name || "Proposal updated",
      client: p.clients, link: "/admin/proposals",
    }));
    (leadsRes.data || []).forEach((l: any) => items.push({
      id: `lead-${l.id}`, ts: l.created_at, source: "lead",
      title: `New lead: ${l.name}`,
      summary: l.company ? `${l.company} · ${l.status}` : l.status,
      link: "/admin/leads",
    }));
    (clientsRes.data || []).forEach((c: any) => items.push({
      id: `client-${c.id}`, ts: c.created_at, source: "client",
      title: `New client: ${c.name}`,
      summary: `${c.client_number || ""} · ${c.status}`,
      client: { id: c.id, name: c.name, client_number: c.client_number },
      link: `/admin/clients/${c.id}`,
    }));
    (projectsRes.data || []).forEach((p: any) => items.push({
      id: `proj-${p.id}`, ts: p.updated_at, source: "project",
      title: `Project: ${p.name}`,
      summary: `Phase: ${p.current_phase || "—"}`,
      client: p.clients, link: "/admin/projects",
    }));
    items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    setFeed(items.slice(0, 50));

    // Action board — pull all action_required emails (not just last 24h)
    const { data: actionData } = await supabase.from("email_intelligence")
      .select("id, subject, suggested_action, from_name, from_email, processed_at, sentiment, clients(id, name, client_number)")
      .eq("action_required", true).order("processed_at", { ascending: false }).limit(30);
    const urgencyOf = (s: string | null) =>
      s === "Urgent" ? 3 : s === "Negative" ? 2 : s === "Neutral" ? 1 : 0;
    setActions((actionData || []).map((e: any) => ({
      id: e.id, source: "email" as const,
      title: e.subject || `Email from ${e.from_name || e.from_email}`,
      detail: e.suggested_action || "Review and respond",
      client: e.clients, ts: e.processed_at,
      urgency: urgencyOf(e.sentiment),
    })).sort((a, b) => b.urgency - a.urgency || new Date(b.ts).getTime() - new Date(a.ts).getTime()));

    // KPIs
    const totalHours = (hoursRes.data || []).reduce((sum: number, r: any) => sum + Number(r.hours || 0), 0);
    setKpis({
      activeClients: activeClientsRes.count || 0,
      openProposals: openProposalsRes.count || 0,
      leadsInPipeline: leadsCountRes.count || 0,
      hoursThisMonth: Math.round(totalHours * 10) / 10,
      contentPublished: contentPubRes.count || 0,
      emailsAwaiting: emailsActionRes.count || 0,
    });

    // Pipelines
    const now = Date.now();
    const fresh = (ts: string | null | undefined, hours = 48) =>
      !!ts && now - new Date(ts).getTime() < hours * 3600 * 1000;
    setPipelines([
      { name: "Fathom",         icon: Phone, lastRan: lastCallRes.data?.created_at || null,    ok: fresh(lastCallRes.data?.created_at, 168) },
      { name: "Email",          icon: Mail,  lastRan: lastEmailRes.data?.processed_at || null, ok: fresh(lastEmailRes.data?.processed_at, 24) },
      { name: "Business Media", icon: Video, lastRan: lastContentRes.data?.updated_at || null, ok: fresh(lastContentRes.data?.updated_at, 168) },
    ]);

    // Market intelligence — table may not exist yet; fail silently
    try {
      const parseInsights = (raw: any): MarketInsight[] =>
        Array.isArray(raw) ? raw
          : typeof raw === "string"
            ? (() => { try { const j = JSON.parse(raw); return Array.isArray(j) ? j : []; } catch { return []; } })()
            : [];

      // Latest agency report
      const { data: agencyRow } = await (supabase as any)
        .from("market_intelligence")
        .select("id, generated_at, insights, report_type, client_id")
        .eq("report_type", "agency")
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (agencyRow) {
        setMarketReport({
          id: agencyRow.id,
          generated_at: agencyRow.generated_at,
          insights: parseInsights(agencyRow.insights),
          report_type: "agency",
        });
      } else {
        setMarketReport(null);
      }

      // Latest per-client reports (one per client, most recent each)
      const { data: clientRows } = await (supabase as any)
        .from("market_intelligence")
        .select("id, generated_at, insights, report_type, client_id, clients(name, client_number)")
        .eq("report_type", "client")
        .order("generated_at", { ascending: false })
        .limit(50);

      if (clientRows && clientRows.length) {
        const seen = new Set<string>();
        const latest: MarketReport[] = [];
        for (const row of clientRows as any[]) {
          if (!row.client_id || seen.has(row.client_id)) continue;
          seen.add(row.client_id);
          latest.push({
            id: row.id,
            generated_at: row.generated_at,
            insights: parseInsights(row.insights),
            client_id: row.client_id,
            client_name: row.clients?.name ?? "Client",
            client_number: row.clients?.client_number ?? null,
            report_type: "client",
          });
        }
        setClientReports(latest);
      } else {
        setClientReports([]);
      }
    } catch {
      setMarketReport(null);
      setClientReports([]);
    }

    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Realtime: instantly refresh when n8n inserts a new market intelligence report
  useEffect(() => {
    const channel = supabase
      .channel("market-intel-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "market_intelligence" },
        (payload) => {
          const row: any = payload.new;
          const raw = row?.insights;
          const insights: MarketInsight[] = Array.isArray(raw)
            ? raw
            : typeof raw === "string"
              ? (() => { try { return JSON.parse(raw); } catch { return []; } })()
              : [];
          setMarketReport({ id: row.id, generated_at: row.generated_at, insights });
          setMarketRunning(false);
          setMarketRunStatus({
            type: "success",
            message: "New Market Intelligence report received.",
            detail: `Generated ${new Date(row.generated_at).toLocaleString()}`,
          });
          toast.success("New Market Intelligence report ready");
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Realtime: surface n8n workflow failures instantly
  useEffect(() => {
    const channel = supabase
      .channel("market-intel-errors-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "market_intelligence_errors" },
        (payload) => {
          const row: any = payload.new;
          const stage = row?.stage || "unknown stage";
          const msg = row?.error_message || "Unknown error";
          setMarketRunning(false);
          setMarketRunStatus({
            type: "error",
            message: `Market Intelligence run failed at ${stage}`,
            detail: msg,
          });
          toast.error(`Market Intelligence failed: ${stage}`, { description: msg });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const runMarketIntelligence = async () => {
    setMarketRunning(true);
    setMarketRunStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke("trigger-market-intelligence", {
        body: { report_type: "agency" },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const tasksCreated = (data as any)?.tasks_created ?? 0;
      const insightCount = (data as any)?.insight_count ?? 0;
      setMarketRunStatus({
        type: "success",
        message: `Agency report generated: ${insightCount} insights.`,
        detail: tasksCreated
          ? `${tasksCreated} high-urgency task${tasksCreated === 1 ? "" : "s"} auto-created in Ops.`
          : "No high-urgency items this run.",
      });
      toast.success("Market Intelligence run triggered.");
      window.setTimeout(() => void fetchAll(), 2500);
    } catch (e: any) {
      const message = e?.message || "Failed to trigger market intelligence";
      setMarketRunStatus({ type: "error", message });
      toast.error(message);
    } finally {
      setMarketRunning(false);
    }
  };

  const runClientIntelligence = async () => {
    setClientRunning(true);
    setMarketRunStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke("trigger-market-intelligence", {
        body: { report_type: "client" },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const results = ((data as any)?.results ?? []) as any[];
      const totalTasks = results.reduce((s, r) => s + (r.tasks_created ?? 0), 0);
      const totalInsights = results.reduce((s, r) => s + (r.insight_count ?? 0), 0);
      setMarketRunStatus({
        type: "success",
        message: `Per-client scan: ${results.length} clients, ${totalInsights} insights.`,
        detail: totalTasks
          ? `${totalTasks} high-urgency task${totalTasks === 1 ? "" : "s"} auto-created in Ops.`
          : "No high-urgency items this run.",
      });
      toast.success(`Per-client scan complete: ${results.length} clients`);
      setMarketTab("client");
      window.setTimeout(() => void fetchAll(), 1500);
    } catch (e: any) {
      const message = e?.message || "Failed to run per-client intelligence";
      setMarketRunStatus({ type: "error", message });
      toast.error(message);
    } finally {
      setClientRunning(false);
    }
  };

  const TYPE_META: Record<string, { tone: string; bg: string; icon: typeof Mail; label: string }> = {
    opportunity: { tone: "text-green-600",  bg: "bg-green-500/10 border-green-500/30",   icon: Lightbulb,    label: "Opportunity" },
    risk:        { tone: "text-destructive",bg: "bg-destructive/10 border-destructive/30",icon: AlertCircle, label: "Risk" },
    trend:       { tone: "text-blue-500",   bg: "bg-blue-500/10 border-blue-500/30",     icon: TrendingUp,   label: "Trend" },
    competitor:  { tone: "text-purple-500", bg: "bg-purple-500/10 border-purple-500/30", icon: Target,       label: "Competitor" },
  };
  const URGENCY_META: Record<string, string> = {
    high:   "bg-destructive text-destructive-foreground",
    medium: "bg-orange-500 text-white",
    low:    "bg-green-500 text-white",
  };

  const kpiTiles = [
    { label: "Active Clients",     value: kpis.activeClients,    icon: Users,        tone: "text-green-500",   link: "/admin/clients" },
    { label: "Open Proposals",     value: kpis.openProposals,    icon: FileText,     tone: "text-yellow-500",  link: "/admin/proposals" },
    { label: "Leads in Pipeline",  value: kpis.leadsInPipeline,  icon: TrendingUp,   tone: "text-orange-500",  link: "/admin/leads" },
    { label: "Hours This Month",   value: kpis.hoursThisMonth,   icon: Clock,        tone: "text-blue-500",    link: "/ops/timesheets" },
    { label: "Content Published",  value: kpis.contentPublished, icon: Video,        tone: "text-pink-500",    link: "/admin/business-media" },
    { label: "Emails Awaiting",    value: kpis.emailsAwaiting,   icon: Inbox,        tone: "text-primary",     link: "/ops/email-intelligence" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">The Brain</h1>
            <p className="text-sm text-muted-foreground">Vektiss Autonomous OS — central intelligence hub</p>
          </div>
        </div>
        <Button onClick={fetchAll} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Brain status bar */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4 text-primary" />
            Pipelines
          </div>
          {pipelines.map((p) => (
            <div key={p.name} className="flex items-center gap-2 text-sm">
              <p.icon className="h-4 w-4 text-muted-foreground" />
              <span>{p.name}</span>
              {p.ok ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-orange-500" />
              )}
              <span className="text-xs text-muted-foreground">{timeAgo(p.lastRan)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiTiles.map((k) => (
          <Link key={k.label} to={k.link}>
            <Card className="hover:bg-muted/30 transition-colors h-full">
              <CardContent className="p-4">
                <k.icon className={cn("h-5 w-5 mb-2", k.tone)} />
                <p className="text-2xl font-bold leading-none">{loading ? "—" : k.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Market Intelligence */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Market Intelligence
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button onClick={runMarketIntelligence} variant="outline" size="sm" disabled={marketRunning || clientRunning}>
                <Play className={cn("h-4 w-4 mr-2", marketRunning && "animate-pulse")} />
                Run Agency
              </Button>
              <Button onClick={runClientIntelligence} variant="default" size="sm" disabled={marketRunning || clientRunning}>
                <Users className={cn("h-4 w-4 mr-2", clientRunning && "animate-pulse")} />
                Run Per-Client
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {marketRunStatus && (
            <div className={cn(
              "mb-4 rounded-md border p-3 text-sm",
              marketRunStatus.type === "success"
                ? "border-primary/30 bg-primary/10 text-foreground"
                : "border-destructive/30 bg-destructive/10 text-foreground"
            )}>
              <div className="flex items-start gap-2">
                {marketRunStatus.type === "success" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                <div className="min-w-0">
                  <p className="font-medium">{marketRunStatus.message}</p>
                  {marketRunStatus.detail && (
                    <p className="mt-1 break-words text-xs text-muted-foreground">{marketRunStatus.detail}</p>
                  )}
                </div>
              </div>
            </div>
          )}
          <Tabs value={marketTab} onValueChange={(v) => setMarketTab(v as "agency" | "client")}>
            <TabsList className="mb-3">
              <TabsTrigger value="agency">
                Agency
                {marketReport && (
                  <Badge variant="outline" className="ml-2 text-xs">{timeAgo(marketReport.generated_at)}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="client">
                By Client
                {clientReports.length > 0 && (
                  <Badge variant="outline" className="ml-2 text-xs">{clientReports.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="agency" className="mt-0">
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
                </div>
              ) : !marketReport || marketReport.insights.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-md">
                  <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No agency report yet. Click <span className="font-medium">Run Agency</span> to generate one.
                </div>
              ) : (
                <InsightGrid insights={marketReport.insights} TYPE_META={TYPE_META} URGENCY_META={URGENCY_META} />
              )}
            </TabsContent>

            <TabsContent value="client" className="mt-0">
              {loading ? (
                <div className="space-y-3">
                  {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
                </div>
              ) : clientReports.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-md">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No per-client reports yet. Click <span className="font-medium">Run Per-Client</span> to generate
                  tailored insights for every active client.
                </div>
              ) : (
                <div className="space-y-5">
                  {clientReports.map((rep) => (
                    <div key={rep.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <UserPlus className="h-4 w-4 text-primary" />
                        <h4 className="text-sm font-semibold">{rep.client_name}</h4>
                        {rep.client_number && (
                          <Badge variant="outline" className="text-xs">{rep.client_number}</Badge>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">{timeAgo(rep.generated_at)}</span>
                      </div>
                      {rep.insights.length === 0 ? (
                        <div className="text-xs text-muted-foreground italic px-3 py-2 border border-dashed rounded">
                          No insights parsed for this client.
                        </div>
                      ) : (
                        <InsightGrid insights={rep.insights} TYPE_META={TYPE_META} URGENCY_META={URGENCY_META} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Live pulse feed */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Live Pulse Feed
              <Badge variant="outline" className="ml-auto text-xs">Last 24h</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[520px] pr-3">
              {loading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : feed.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No activity in the last 24 hours
                </div>
              ) : (
                <div className="space-y-2">
                  {feed.map((item) => {
                    const meta = SOURCE_META[item.source];
                    const content = (
                      <div className="flex gap-3 p-3 rounded-md hover:bg-muted/40 transition-colors">
                        <div className={cn("h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0", meta.tone)}>
                          <meta.icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{item.title}</span>
                            {item.client && (
                              <Badge variant="outline" className="text-xs">
                                {item.client.client_number || item.client.name}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.summary}</p>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                          {timeAgo(item.ts)}
                        </span>
                      </div>
                    );
                    return item.link
                      ? <Link key={item.id} to={item.link}>{content}</Link>
                      : <div key={item.id}>{content}</div>;
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Action board */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-orange-500" />
              Action Board
              <Badge variant="outline" className="ml-auto text-xs">{actions.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[520px] pr-3">
              {loading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
                </div>
              ) : actions.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500/70" />
                  Inbox zero. Nothing needs you right now.
                </div>
              ) : (
                <div className="space-y-2">
                  {actions.map((a) => (
                    <Link key={a.id} to="/ops/email-intelligence">
                      <div className={cn(
                        "p-3 rounded-md border transition-colors hover:bg-muted/40",
                        a.urgency >= 3 ? "border-destructive/30 bg-destructive/5" :
                        a.urgency >= 2 ? "border-orange-500/30 bg-orange-500/5" :
                        "border-border"
                      )}>
                        <div className="flex items-start gap-2">
                          <AlertCircle className={cn("h-4 w-4 mt-0.5 shrink-0",
                            a.urgency >= 3 ? "text-destructive" :
                            a.urgency >= 2 ? "text-orange-500" :
                            "text-muted-foreground"
                          )} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium line-clamp-1">{a.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.detail}</p>
                            <div className="flex items-center gap-2 mt-2">
                              {a.client && (
                                <Badge variant="outline" className="text-xs">
                                  {a.client.client_number || a.client.name}
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground">{timeAgo(a.ts)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InsightGrid({
  insights,
  TYPE_META,
  URGENCY_META,
}: {
  insights: MarketInsight[];
  TYPE_META: Record<string, { tone: string; bg: string; icon: typeof Mail; label: string }>;
  URGENCY_META: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {insights.map((ins, idx) => {
        const meta = TYPE_META[ins.type] || { tone: "text-muted-foreground", bg: "bg-muted/40 border-border", icon: Lightbulb, label: ins.type };
        const urgencyClass = URGENCY_META[ins.urgency] || "bg-muted text-foreground";
        const body = ins.summary || ins.insight || "";
        return (
          <div key={idx} className={cn("p-4 rounded-md border", meta.bg)}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <meta.icon className={cn("h-4 w-4 shrink-0", meta.tone)} />
                <h4 className="text-sm font-semibold truncate">{ins.title}</h4>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="outline" className={cn("text-xs capitalize", meta.tone)}>{meta.label}</Badge>
                {ins.urgency && (
                  <Badge className={cn("text-xs capitalize", urgencyClass)}>{ins.urgency}</Badge>
                )}
              </div>
            </div>
            <p className="text-sm text-foreground/80 mb-3">{body}</p>
            {ins.recommended_action && (
              <div className="text-xs bg-orange-500/10 border border-orange-500/30 rounded p-2 mb-3">
                <span className="font-semibold text-orange-600 dark:text-orange-400">Recommended action: </span>
                <span className="text-foreground/80">{ins.recommended_action}</span>
              </div>
            )}
            {ins.urgency === "high" && (
              <div className="text-xs flex items-center gap-1 text-orange-600 dark:text-orange-400 mb-2">
                <Zap className="h-3 w-3" />
                Auto-created Ops task (due in 2 days)
              </div>
            )}
            {ins.sources && ins.sources.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {ins.sources.map((s, i) => {
                  const url = typeof s === "string" ? s : s.url;
                  const label = typeof s === "string"
                    ? (() => { try { return new URL(s).hostname.replace("www.",""); } catch { return s; } })()
                    : (s.title || (() => { try { return new URL(s.url).hostname.replace("www.",""); } catch { return s.url; } })());
                  return (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" />
                      {label}
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
