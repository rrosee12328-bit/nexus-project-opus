import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, subHours, startOfDay, endOfDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  Mail,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

type TimeRange = "24h" | "7d" | "30d" | "custom";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  sent: { label: "Sent", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", icon: CheckCircle2 },
  pending: { label: "Pending", color: "bg-amber-500/15 text-amber-400 border-amber-500/20", icon: Clock },
  dlq: { label: "Failed", color: "bg-red-500/15 text-red-400 border-red-500/20", icon: XCircle },
  failed: { label: "Failed", color: "bg-red-500/15 text-red-400 border-red-500/20", icon: XCircle },
  suppressed: { label: "Suppressed", color: "bg-orange-500/15 text-orange-400 border-orange-500/20", icon: AlertTriangle },
  bounced: { label: "Bounced", color: "bg-red-500/15 text-red-400 border-red-500/20", icon: XCircle },
  complained: { label: "Complained", color: "bg-red-500/15 text-red-400 border-red-500/20", icon: AlertTriangle },
};

const PAGE_SIZE = 50;

export default function AdminEmails() {
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [customStart, setCustomStart] = useState<Date>();
  const [customEnd, setCustomEnd] = useState<Date>();
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    switch (timeRange) {
      case "24h":
        return { startDate: subHours(now, 24), endDate: now };
      case "7d":
        return { startDate: subDays(now, 7), endDate: now };
      case "30d":
        return { startDate: subDays(now, 30), endDate: now };
      case "custom":
        return {
          startDate: customStart ? startOfDay(customStart) : subDays(now, 7),
          endDate: customEnd ? endOfDay(customEnd) : now,
        };
    }
  }, [timeRange, customStart, customEnd]);

  // Fetch all logs in the time range
  const { data: rawLogs, isLoading, refetch } = useQuery({
    queryKey: ["email-logs", startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_send_log")
        .select("*")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Deduplicate by message_id (keep latest status per message)
  const dedupedLogs = useMemo(() => {
    if (!rawLogs) return [];
    const byMsgId = new Map<string, typeof rawLogs[0]>();
    // rawLogs is already sorted desc by created_at
    for (const row of rawLogs) {
      const key = row.message_id ?? row.id;
      if (!byMsgId.has(key)) {
        byMsgId.set(key, row);
      }
    }
    return Array.from(byMsgId.values());
  }, [rawLogs]);

  // Get distinct template names
  const templateNames = useMemo(() => {
    const names = new Set(dedupedLogs.map((l) => l.template_name));
    return Array.from(names).sort();
  }, [dedupedLogs]);

  // Apply filters
  const filteredLogs = useMemo(() => {
    return dedupedLogs.filter((log) => {
      if (templateFilter !== "all" && log.template_name !== templateFilter) return false;
      if (statusFilter === "failed" && !["dlq", "failed"].includes(log.status)) return false;
      if (statusFilter !== "all" && statusFilter !== "failed" && log.status !== statusFilter) return false;
      return true;
    });
  }, [dedupedLogs, templateFilter, statusFilter]);

  // Stats
  const stats = useMemo(() => {
    const total = filteredLogs.length;
    const sent = filteredLogs.filter((l) => l.status === "sent").length;
    const failed = filteredLogs.filter((l) => ["dlq", "failed"].includes(l.status)).length;
    const suppressed = filteredLogs.filter((l) => l.status === "suppressed").length;
    const pending = filteredLogs.filter((l) => l.status === "pending").length;
    return { total, sent, failed, suppressed, pending };
  }, [filteredLogs]);

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE);
  const paginatedLogs = filteredLogs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const formatTemplateName = (name: string) =>
    name
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Email Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Monitor email delivery, failures, and engagement.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-border bg-card">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Time range presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Time Range
              </label>
              <div className="flex gap-1">
                {(["24h", "7d", "30d"] as const).map((range) => (
                  <Button
                    key={range}
                    variant={timeRange === range ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setTimeRange(range); setPage(0); }}
                    className="text-xs"
                  >
                    {range === "24h" ? "24h" : range === "7d" ? "7 days" : "30 days"}
                  </Button>
                ))}
                <Button
                  variant={timeRange === "custom" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTimeRange("custom")}
                  className="text-xs"
                >
                  Custom
                </Button>
              </div>
            </div>

            {/* Custom date pickers */}
            {timeRange === "custom" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    From
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2 text-xs">
                        <CalendarIcon className="h-3.5 w-3.5" />
                        {customStart ? format(customStart, "MMM d, yyyy") : "Start date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customStart}
                        onSelect={(d) => { setCustomStart(d); setPage(0); }}
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    To
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2 text-xs">
                        <CalendarIcon className="h-3.5 w-3.5" />
                        {customEnd ? format(customEnd, "MMM d, yyyy") : "End date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customEnd}
                        onSelect={(d) => { setCustomEnd(d); setPage(0); }}
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}

            {/* Template filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Email Type
              </label>
              <Select value={templateFilter} onValueChange={(v) => { setTemplateFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[180px] h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {templateNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {formatTemplateName(name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </label>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[140px] h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="suppressed">Suppressed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-border bg-card">
          <CardContent className="pt-5 pb-4 px-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-bold font-mono">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5 pb-4 px-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sent</p>
                <p className="text-xl font-bold font-mono">{stats.sent}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5 pb-4 px-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Clock className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-xl font-bold font-mono">{stats.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5 pb-4 px-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center">
                <XCircle className="h-4 w-4 text-red-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className="text-xl font-bold font-mono">{stats.failed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-5 pb-4 px-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-orange-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Suppressed</p>
                <p className="text-xl font-bold font-mono">{stats.suppressed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Email Log Table */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Email Log</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : paginatedLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p>No emails found for the selected filters.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Recipient</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Sent At</TableHead>
                      <TableHead className="text-xs">Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedLogs.map((log) => {
                      const cfg = STATUS_CONFIG[log.status] ?? STATUS_CONFIG.pending;
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm">
                            {formatTemplateName(log.template_name)}
                          </TableCell>
                          <TableCell className="text-sm font-mono text-muted-foreground">
                            {log.recipient_email}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn("text-xs gap-1", cfg.color)}
                            >
                              <cfg.icon className="h-3 w-3" />
                              {cfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(log.created_at), "MMM d, yyyy HH:mm")}
                          </TableCell>
                          <TableCell className="text-xs text-red-400 max-w-[200px] truncate">
                            {log.error_message ?? "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredLogs.length)} of {filteredLogs.length}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page === 0}
                      onClick={() => setPage(page - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
