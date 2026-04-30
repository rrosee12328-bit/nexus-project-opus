import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, DollarSign, Users, BarChart3, TrendingUp, AlertCircle } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TimesheetRow {
  id: string;
  project_id: string | null;
  time_code_id: string | null;
  hours: number;
  date: string;
  description: string | null;
  billable: boolean;
  projects?: {
    id: string;
    name: string;
    project_number: string | null;
    client_id: string;
    clients?: { id: string; name: string; client_number: string | null } | null;
  } | null;
  time_tracking_codes?: {
    id: string;
    code: string;
    label: string;
    is_billable: boolean | null;
  } | null;
}

const BILLABLE_RATE = 150;

function buildDateRange(period: string): { start: string; end: string } {
  const now = new Date();
  if (period === "this_month") {
    return { start: format(startOfMonth(now), "yyyy-MM-dd"), end: format(endOfMonth(now), "yyyy-MM-dd") };
  }
  if (period === "last_month") {
    const last = subMonths(now, 1);
    return { start: format(startOfMonth(last), "yyyy-MM-dd"), end: format(endOfMonth(last), "yyyy-MM-dd") };
  }
  if (period === "last_3_months") {
    return { start: format(startOfMonth(subMonths(now, 2)), "yyyy-MM-dd"), end: format(endOfMonth(now), "yyyy-MM-dd") };
  }
  return { start: "2000-01-01", end: "2099-12-31" };
}

export default function TimesheetDashboard() {
  const [period, setPeriod] = useState("this_month");
  const { start, end } = buildDateRange(period);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["timesheet_dashboard", start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timesheets" as any)
        .select(`
          id, project_id, time_code_id, hours, date, description, billable,
          projects (
            id, name, project_number, client_id,
            clients ( id, name, client_number )
          ),
          time_tracking_codes ( id, code, label, is_billable )
        `)
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TimesheetRow[];
    },
  });

  const totalHours = rows.reduce((s, r) => s + Number(r.hours ?? 0), 0);
  const billableHours = rows
    .filter((r) => r.billable || r.time_tracking_codes?.is_billable)
    .reduce((s, r) => s + Number(r.hours ?? 0), 0);
  const nonBillableHours = totalHours - billableHours;
  const billableRevenue = billableHours * BILLABLE_RATE;
  const utilizationPct = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0;

  const clientMap = new Map<string, { client_id: string; client_name: string; client_number: string; total_hours: number; billable_hours: number; non_billable_hours: number }>();
  rows.forEach((r) => {
    const client = r.projects?.clients;
    if (!client) return;
    const key = client.id;
    if (!clientMap.has(key)) {
      clientMap.set(key, {
        client_id: key,
        client_name: client.name,
        client_number: client.client_number ?? "—",
        total_hours: 0,
        billable_hours: 0,
        non_billable_hours: 0,
      });
    }
    const entry = clientMap.get(key)!;
    const hrs = Number(r.hours ?? 0);
    entry.total_hours += hrs;
    if (r.billable || r.time_tracking_codes?.is_billable) entry.billable_hours += hrs;
    else entry.non_billable_hours += hrs;
  });
  const clientSummaries = Array.from(clientMap.values()).sort((a, b) => b.total_hours - a.total_hours);

  const tcMap = new Map<string, { code: string; label: string; is_billable: boolean; total_hours: number }>();
  rows.forEach((r) => {
    const tc = r.time_tracking_codes;
    const key = tc?.code ?? "UNASSIGNED";
    if (!tcMap.has(key)) {
      tcMap.set(key, {
        code: key,
        label: tc?.label ?? "Unassigned",
        is_billable: tc?.is_billable ?? false,
        total_hours: 0,
      });
    }
    tcMap.get(key)!.total_hours += Number(r.hours ?? 0);
  });
  const tcSummaries = Array.from(tcMap.values()).sort((a, b) => b.total_hours - a.total_hours);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">Timesheet Dashboard</h2>
          <p className="text-sm text-muted-foreground">Hours logged across all clients, projects, and cost codes</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="last_3_months">Last 3 Months</SelectItem>
            <SelectItem value="all_time">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10"><Clock className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total Hours</p>
              <p className="text-2xl font-bold text-foreground">{totalHours.toFixed(1)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-emerald-500/10"><DollarSign className="h-5 w-5 text-emerald-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Billable Hours</p>
              <p className="text-2xl font-bold text-foreground">{billableHours.toFixed(1)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-muted"><AlertCircle className="h-5 w-5 text-muted-foreground" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Non-Billable</p>
              <p className="text-2xl font-bold text-foreground">{nonBillableHours.toFixed(1)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10"><TrendingUp className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Utilization</p>
              <p className="text-2xl font-bold text-foreground">{utilizationPct}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Banner */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              Estimated Billable Revenue
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">
              ${billableRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {billableHours.toFixed(1)} billable hours @ ${BILLABLE_RATE}/hr default rate
          </p>
        </CardContent>
      </Card>

      {/* Two-column */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Hours by Client
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : clientSummaries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No entries for this period.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Billable</TableHead>
                    <TableHead className="text-right">Non-Bill</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientSummaries.map((c) => (
                    <TableRow key={c.client_id}>
                      <TableCell>
                        <p className="font-medium text-foreground">{c.client_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{c.client_number}</p>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{c.total_hours.toFixed(1)}h</TableCell>
                      <TableCell className="text-right font-mono text-sm text-emerald-500">{c.billable_hours.toFixed(1)}h</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{c.non_billable_hours.toFixed(1)}h</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Hours by Cost Code
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : tcSummaries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No entries for this period.</p>
            ) : (
              <div className="space-y-3">
                {tcSummaries.map((tc) => {
                  const pct = totalHours > 0 ? (tc.total_hours / totalHours) * 100 : 0;
                  return (
                    <div key={tc.code} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className="font-mono text-xs">{tc.code}</Badge>
                          <span className="text-sm text-foreground truncate">{tc.label}</span>
                        </div>
                        <span className="text-sm font-mono text-muted-foreground shrink-0">{tc.total_hours.toFixed(1)}h</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Entries */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Recent Entries
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No entries found for this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Cost Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 50).map((r) => {
                  const client = r.projects?.clients;
                  const isBillable = r.billable || r.time_tracking_codes?.is_billable;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {r.date ? format(new Date(r.date), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell>
                        {client ? (
                          <div>
                            <p className="text-sm text-foreground">{client.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{client.client_number}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Internal</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.projects?.name ?? "—"}</TableCell>
                      <TableCell>
                        {r.time_tracking_codes ? (
                          <Badge variant="outline" className="font-mono text-xs">{r.time_tracking_codes.code}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm max-w-[300px] truncate">{r.description ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{Number(r.hours ?? 0).toFixed(1)}</TableCell>
                      <TableCell>
                        <Badge variant={isBillable ? "default" : "outline"} className="text-xs">
                          {isBillable ? "Billable" : "Non-Bill"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}