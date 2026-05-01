import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";

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
      summary: (c.summary || "").slice(0, 140) || "Call transcript ready",
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

    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

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
