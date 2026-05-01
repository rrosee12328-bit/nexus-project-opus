import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Search,
  RefreshCw,
  User,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EmailRecord {
  id: string;
  client_id: string | null;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  received_at: string | null;
  email_type: string | null;
  summary: string | null;
  sentiment: string | null;
  action_required: boolean;
  suggested_action: string | null;
  raw_body: string | null;
  outlook_message_id: string | null;
  created_at: string;
  clients?: { name: string; client_number: string } | null;
}

const SENTIMENT_CONFIG: Record<string, { color: string; label: string }> = {
  Positive: { color: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30", label: "Positive" },
  Neutral:  { color: "bg-muted text-muted-foreground border-border", label: "Neutral" },
  Urgent:   { color: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30", label: "Urgent" },
  Negative: { color: "bg-destructive/15 text-destructive border-destructive/30", label: "Negative" },
};

const TYPE_CONFIG: Record<string, { color: string; label: string }> = {
  lead_inquiry:      { color: "bg-purple-500/15 text-purple-700 dark:text-purple-400", label: "Lead Inquiry" },
  client_request:    { color: "bg-primary/15 text-primary", label: "Client Request" },
  proposal_activity: { color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400", label: "Proposal Activity" },
  general:           { color: "bg-muted text-muted-foreground", label: "General" },
  internal:          { color: "bg-slate-500/15 text-slate-700 dark:text-slate-400", label: "Internal" },
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function EmailIntelligence() {
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchEmails = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_intelligence")
      .select(`*, clients (name, client_number)`)
      .order("received_at", { ascending: false })
      .limit(100);
    if (!error && data) setEmails(data as unknown as EmailRecord[]);
    setLoading(false);
  };

  useEffect(() => { fetchEmails(); }, []);

  const filtered = emails.filter((e) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (e.from_email || "").toLowerCase().includes(q) ||
      (e.from_name || "").toLowerCase().includes(q) ||
      (e.subject || "").toLowerCase().includes(q) ||
      (e.summary || "").toLowerCase().includes(q);
    const matchType = typeFilter === "all" || e.email_type === typeFilter;
    const matchSentiment = sentimentFilter === "all" || e.sentiment === sentimentFilter;
    const matchAction =
      actionFilter === "all" ||
      (actionFilter === "yes" && e.action_required) ||
      (actionFilter === "no" && !e.action_required);
    return matchSearch && matchType && matchSentiment && matchAction;
  });

  const actionItems = emails.filter((e) => e.action_required);
  const leads = emails.filter((e) => e.email_type === "lead_inquiry");
  const urgent = emails.filter((e) => e.sentiment === "Urgent" || e.sentiment === "Negative");

  const kpis = [
    { icon: Mail, value: emails.length, label: "Total Emails", tone: "text-primary" },
    { icon: AlertCircle, value: actionItems.length, label: "Action Required", tone: "text-orange-500" },
    { icon: TrendingUp, value: leads.length, label: "Lead Inquiries", tone: "text-purple-500" },
    { icon: Zap, value: urgent.length, label: "Urgent / Negative", tone: "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Email Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-analysed inbound emails — matched to clients, flagged for action
          </p>
        </div>
        <Button onClick={fetchEmails} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <k.icon className={cn("h-8 w-8 shrink-0", k.tone)} />
              <div className="min-w-0">
                <p className="text-2xl font-bold leading-none">{k.value}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action Required Banner */}
      {actionItems.length > 0 && (
        <Card className="border-orange-500/40 bg-orange-500/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 font-medium text-orange-700 dark:text-orange-400">
              <AlertCircle className="h-4 w-4" />
              {actionItems.length} email{actionItems.length > 1 ? "s" : ""} require your attention
            </div>
            <div className="space-y-2">
              {actionItems.slice(0, 3).map((e) => (
                <div key={e.id} className="flex items-start gap-2 text-sm">
                  <Clock className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate">
                      <span className="font-medium">{e.from_name || e.from_email}</span>
                      {" — "}
                      <span className="text-muted-foreground">{e.subject || "(no subject)"}</span>
                    </p>
                    {e.suggested_action && (
                      <p className="text-xs text-muted-foreground mt-0.5">{e.suggested_action}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{timeAgo(e.received_at)}</span>
                </div>
              ))}
              {actionItems.length > 3 && (
                <p className="text-xs text-muted-foreground pl-6">
                  + {actionItems.length - 3} more — filter by "Action required" below
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search emails..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="lead_inquiry">Lead Inquiry</SelectItem>
            <SelectItem value="client_request">Client Request</SelectItem>
            <SelectItem value="proposal_activity">Proposal Activity</SelectItem>
            <SelectItem value="general">General</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
          <SelectTrigger><SelectValue placeholder="All sentiments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sentiments</SelectItem>
            <SelectItem value="Positive">Positive</SelectItem>
            <SelectItem value="Neutral">Neutral</SelectItem>
            <SelectItem value="Urgent">Urgent</SelectItem>
            <SelectItem value="Negative">Negative</SelectItem>
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger><SelectValue placeholder="All emails" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All emails</SelectItem>
            <SelectItem value="yes">Action required</SelectItem>
            <SelectItem value="no">No action needed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Email List */}
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-12">Loading emails...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 flex flex-col items-center text-center">
            <Mail className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No emails yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Emails will appear here once the n8n pipeline processes your Outlook inbox
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((email) => {
            const sentConf = SENTIMENT_CONFIG[email.sentiment || "Neutral"] || SENTIMENT_CONFIG.Neutral;
            const typeConf = TYPE_CONFIG[email.email_type || "general"] || TYPE_CONFIG.general;
            const isExpanded = expanded === email.id;

            return (
              <Card
                key={email.id}
                className="cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpanded(isExpanded ? null : email.id)}
              >
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    {/* Avatar */}
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <User className="h-5 w-5 text-muted-foreground" />
                    </div>

                    {/* Main */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {email.from_name || email.from_email}
                        </span>
                        {email.clients && (
                          <Badge variant="outline" className="text-xs">
                            {email.clients.client_number} · {email.clients.name}
                          </Badge>
                        )}
                        <Badge variant="outline" className={cn("text-xs border-transparent", typeConf.color)}>
                          {typeConf.label}
                        </Badge>
                        <Badge variant="outline" className={cn("text-xs", sentConf.color)}>
                          {sentConf.label}
                        </Badge>
                        {email.action_required && (
                          <Badge variant="outline" className="text-xs bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Action Required
                          </Badge>
                        )}
                      </div>

                      <p className="text-sm font-medium mt-1 truncate">
                        {email.subject || "(no subject)"}
                      </p>

                      {email.summary && (
                        <p className={cn("text-sm text-muted-foreground mt-1", !isExpanded && "line-clamp-2")}>
                          {email.summary}
                        </p>
                      )}

                      {isExpanded && (
                        <div className="mt-3 space-y-3 pt-3 border-t border-border">
                          <p className="text-xs text-muted-foreground">
                            From: {email.from_name} &lt;{email.from_email}&gt;
                          </p>
                          {email.suggested_action && (
                            <div className="flex gap-2 p-3 rounded-md bg-primary/5 border border-primary/20">
                              <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs font-medium text-primary">Suggested Action</p>
                                <p className="text-sm mt-1">{email.suggested_action}</p>
                              </div>
                            </div>
                          )}
                          {email.raw_body && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Original Email</p>
                              <pre className="text-xs whitespace-pre-wrap font-sans bg-muted/50 p-3 rounded-md max-h-64 overflow-auto">
                                {email.raw_body.replace(/<[^>]*>/g, "").substring(0, 2000)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Time */}
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {timeAgo(email.received_at)}
                      </span>
                      {email.action_required ? (
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground/50" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
