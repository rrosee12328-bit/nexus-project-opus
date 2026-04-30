import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, Send, ExternalLink, Loader2, FileText, CheckCircle2, Clock, CalendarClock, Timer, Eye, Download, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Client = { id: string; name: string; client_number: string | null; email: string | null };

type Project = { id: string; name: string; project_number: string | null; client_id: string };

type Entry = {
  id: string;
  source: "timesheet" | "calendar";
  hours: number;
  date: string;
  description: string | null;
  projectName: string | null;
  projectId: string | null;
  code: string | null;
};

const EMPTY_ENTRIES: Entry[] = [];

type HourlyInvoice = {
  id: string;
  client_id: string;
  invoice_number: string | null;
  status: string;
  hourly_rate: number;
  total_hours: number;
  amount_due: number;
  amount_paid: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  created_at: string;
  clients?: { name: string; client_number: string | null } | null;
};

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
    open: { label: "Sent", className: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
    paid: { label: "Paid", className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
    void: { label: "Void", className: "bg-muted text-muted-foreground line-through" },
    uncollectible: { label: "Uncollectible", className: "bg-destructive/15 text-destructive border-destructive/30" },
  };
  const m = map[status] ?? map.draft;
  return <Badge variant="outline" className={m.className}>{m.label}</Badge>;
}

export default function Invoices() {
  const qc = useQueryClient();
  const today = new Date();
  const [clientId, setClientId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("all");
  const [start, setStart] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [end, setEnd] = useState(format(endOfMonth(today), "yyyy-MM-dd"));
  const [rate, setRate] = useState("150");
  const [notes, setNotes] = useState("");
  const [autoFinalize, setAutoFinalize] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);

  // composite key helpers: "timesheet:<id>" / "calendar:<id>"
  const key = (e: Pick<Entry, "source" | "id">) => `${e.source}:${e.id}`;

  const { data: clients = [] } = useQuery({
    queryKey: ["invoices-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, client_number, email")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["invoices-projects", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, project_number, client_id")
        .eq("client_id", clientId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Project[];
    },
  });

  const { data: invoiceEntries, isLoading: loadingEntries } = useQuery({
    queryKey: ["invoice-entries", clientId, projectId, start, end],
    enabled: !!clientId,
    queryFn: async () => {
      // 1. Timesheet entries (existing source)
      let tsQuery = supabase
        .from("timesheets")
        .select(`
          id, hours, date, description, project_id,
          projects!inner ( name, project_number, client_id ),
          time_tracking_codes ( code, label )
        `)
        .eq("billable", true)
        .is("invoiced_at", null)
        .gte("date", start)
        .lte("date", end)
        .eq("projects.client_id", clientId)
        .order("date", { ascending: true });
      if (projectId !== "all") {
        tsQuery = tsQuery.eq("project_id", projectId);
      }
      const tsPromise = tsQuery;

      // 2. Calendar events for this client in range, billable + unbilled
      let calQuery = supabase
        .from("calendar_events" as any)
        .select("id, title, description, event_date, start_time, end_time, billable, invoiced_at, client_id, project_id")
        .eq("client_id", clientId)
        .eq("billable", true)
        .is("invoiced_at", null)
        .gte("event_date", start)
        .lte("event_date", end)
        .order("event_date", { ascending: true });
      if (projectId !== "all") {
        calQuery = calQuery.eq("project_id", projectId);
      }
      const calPromise = calQuery;

      const [{ data: ts, error: tsErr }, { data: cal, error: calErr }] = await Promise.all([tsPromise, calPromise]);
      if (tsErr) throw tsErr;
      if (calErr) throw calErr;

      const tsEntries: Entry[] = (ts ?? []).map((e: any) => ({
        id: e.id,
        source: "timesheet",
        hours: Number(e.hours ?? 0),
        date: e.date,
        description: e.description ?? null,
        projectName: e.projects?.name ?? null,
        projectId: e.project_id ?? null,
        code: e.time_tracking_codes?.code ?? null,
      }));

      const calEntries: Entry[] = (cal ?? [])
        .map((e: any) => {
          // hours = (end - start). If missing, default to 1h.
          let hours = 1;
          if (e.start_time && e.end_time) {
            const [sh, sm] = String(e.start_time).split(":").map(Number);
            const [eh, em] = String(e.end_time).split(":").map(Number);
            const mins = (eh * 60 + em) - (sh * 60 + sm);
            if (mins > 0) hours = Math.round((mins / 60) * 100) / 100;
          }
          return {
            id: e.id,
            source: "calendar" as const,
            hours,
            date: e.event_date,
            description: e.title + (e.description ? ` — ${e.description}` : ""),
            projectName: null,
            projectId: e.project_id ?? null,
            code: "CAL",
          };
        });

      return [...tsEntries, ...calEntries].sort((a, b) => a.date.localeCompare(b.date));
    },
  });

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ["hourly-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hourly_invoices" as any)
        .select(`*, clients ( name, client_number )`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as HourlyInvoice[];
    },
  });

  const entries = invoiceEntries ?? EMPTY_ENTRIES;

  useEffect(() => {
    if (entries.length > 0) {
      setSelected(new Set(entries.map((e) => key(e))));
    } else {
      setSelected(new Set());
    }
  }, [invoiceEntries]);

  const hourlyRate = Number(rate);
  const hasValidRate = Number.isFinite(hourlyRate) && hourlyRate > 0;
  const selectedEntries = entries.filter((e) => selected.has(key(e)));
  const allEntriesSelected = entries.length > 0 && selectedEntries.length === entries.length;
  const selectedHours = selectedEntries.reduce((s, e) => s + Number(e.hours || 0), 0);
  const selectedAmount = selectedHours * (hasValidRate ? hourlyRate : 0);

  // Per-source breakdown for the entries card
  const totalAvailableHours = entries.reduce((s, e) => s + Number(e.hours || 0), 0);
  const selectedTimesheetHours = selectedEntries
    .filter((e) => e.source === "timesheet")
    .reduce((s, e) => s + Number(e.hours || 0), 0);
  const selectedCalendarHours = selectedEntries
    .filter((e) => e.source === "calendar")
    .reduce((s, e) => s + Number(e.hours || 0), 0);

  const toggle = (k: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };
  const toggleAll = () => {
    if (allEntriesSelected) setSelected(new Set());
    else setSelected(new Set(entries.map((e) => key(e))));
  };

  const createInvoice = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Pick a client");
      if (selectedEntries.length === 0) throw new Error("Select at least one entry");
      if (!hasValidRate) throw new Error("Enter an hourly rate");
      const timesheet_ids: string[] = [];
      const calendar_event_ids: string[] = [];
      for (const entry of selectedEntries) {
        if (entry.source === "timesheet") timesheet_ids.push(entry.id);
        else if (entry.source === "calendar") calendar_event_ids.push(entry.id);
      }
      const { data, error } = await supabase.functions.invoke("create-hourly-invoice", {
        body: {
          client_id: clientId,
          timesheet_ids,
          calendar_event_ids,
          hourly_rate: hourlyRate,
          notes: notes || undefined,
          auto_finalize: autoFinalize,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(autoFinalize ? "Invoice sent to client" : "Draft invoice created");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["invoice-entries"] });
      qc.invalidateQueries({ queryKey: ["hourly-invoices"] });
      if (data?.hosted_invoice_url) window.open(data.hosted_invoice_url, "_blank");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create invoice"),
  });

  const stats = useMemo(() => {
    const outstanding = invoices
      .filter((i) => i.status === "open")
      .reduce((s, i) => s + Number(i.amount_due) - Number(i.amount_paid), 0);
    const paidThisMonth = invoices
      .filter((i) => i.status === "paid" && i.paid_at && new Date(i.paid_at) >= startOfMonth(today))
      .reduce((s, i) => s + Number(i.amount_paid), 0);
    return { outstanding, paidThisMonth, count: invoices.length };
  }, [invoices, today]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" /> Hourly Invoices
          </h1>
          <p className="text-sm text-muted-foreground">Bill clients for tracked hourly work via Stripe</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-blue-500/10"><Clock className="h-5 w-5 text-blue-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="text-2xl font-bold text-foreground">${stats.outstanding.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-emerald-500/10"><CheckCircle2 className="h-5 w-5 text-emerald-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Paid this month</p>
              <p className="text-2xl font-bold text-foreground">${stats.paidThisMonth.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10"><FileText className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total invoices</p>
              <p className="text-2xl font-bold text-foreground">{stats.count}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="builder">
        <TabsList>
          <TabsTrigger value="builder" className="gap-1.5"><Send className="h-3.5 w-3.5" /> New Invoice</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><Receipt className="h-3.5 w-3.5" /> History</TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">1. Select client and period</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <Label>Client</Label>
                <Select value={clientId} onValueChange={(v) => { setClientId(v); setProjectId("all"); setSelected(new Set()); }}>
                  <SelectTrigger><SelectValue placeholder="Pick a client…" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.email ? "" : "· no email"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Project</Label>
                <Select
                  value={projectId}
                  onValueChange={(v) => { setProjectId(v); setSelected(new Set()); }}
                  disabled={!clientId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={clientId ? "All projects" : "Pick a client first"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All projects (client-level)</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}{p.project_number ? ` · ${p.project_number}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>From</Label>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <Label>To</Label>
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>2. Pick billable entries</span>
                {clientId && entries.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={toggleAll}>
                    {allEntriesSelected ? "Clear" : "Select all"}
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!clientId ? (
                <p className="p-6 text-sm text-muted-foreground">Pick a client to see unbilled entries.</p>
              ) : loadingEntries ? (
                <p className="p-6 text-sm text-muted-foreground">Loading…</p>
              ) : entries.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No unbilled billable hours in this period.</p>
              ) : (
                <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Date</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((e) => (
                      <TableRow key={key(e)} className={selected.has(key(e)) ? "bg-primary/5" : ""}>
                        <TableCell>
                          <Checkbox checked={selected.has(key(e))} onCheckedChange={() => toggle(key(e))} />
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{format(new Date(e.date), "MMM d")}</TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-1.5">
                            {e.source === "calendar" ? (
                              <CalendarClock className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                            ) : (
                              <Timer className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            )}
                            <span>{e.projectName ?? (e.source === "calendar" ? "Calendar event" : "—")}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {e.code ? (
                            <Badge variant="outline" className="font-mono text-xs">{e.code}</Badge>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm max-w-[300px] truncate">{e.description ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{Number(e.hours).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <tfoot className="bg-muted/30 border-t">
                    <tr className="text-sm">
                      <td colSpan={4} className="px-4 py-3 text-right align-middle">
                        <span className="text-muted-foreground">
                          {selectedEntries.length} of {entries.length} selected
                          {selectedEntries.length > 0 && (
                            <span className="ml-2">
                              · <Timer className="inline h-3 w-3 -mt-0.5" /> {selectedTimesheetHours.toFixed(2)}h timesheet
                              · <CalendarClock className="inline h-3 w-3 -mt-0.5 text-blue-500" /> {selectedCalendarHours.toFixed(2)}h calendar
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right align-middle">
                        <p className="font-mono text-xs text-muted-foreground">
                          {selectedHours.toFixed(2)} h × ${Number(rate || 0).toFixed(2)}/hr
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right align-middle font-mono font-bold text-foreground">
                        ${selectedAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </Table>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">3. Set rate & send</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>Hourly rate (USD)</Label>
                  <Input type="number" min={1} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <Label>Notes (appears on invoice)</Label>
                  <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Hourly engineering work for May 2026" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="auto-fin" checked={autoFinalize} onCheckedChange={(v) => setAutoFinalize(!!v)} />
                <Label htmlFor="auto-fin" className="text-sm font-normal cursor-pointer">
                  Finalize and email immediately (uncheck to create a draft you review in Stripe first)
                </Label>
              </div>

              <div className="flex items-center justify-between p-4 rounded-md bg-muted/40 border">
                <div className="text-sm">
                  <p className="text-muted-foreground">
                    {selectedEntries.length} entries · {selectedHours.toFixed(2)} hrs @ ${Number(rate || 0).toFixed(2)}/hr
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    ${selectedAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </p>
                  {(selectedEntries.length === 0 || !hasValidRate) && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      {selectedEntries.length === 0
                        ? "Tick at least one entry above to enable invoicing"
                        : "Enter an hourly rate above"}
                    </p>
                  )}
                </div>
                <Button
                  size="lg"
                  onClick={() => createInvoice.mutate()}
                  disabled={createInvoice.isPending || selectedEntries.length === 0 || !hasValidRate}
                  className="gap-2"
                >
                  {createInvoice.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {autoFinalize ? "Create & Send" : "Create Draft"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {loadingInvoices ? (
                <p className="p-6 text-sm text-muted-foreground">Loading…</p>
              ) : invoices.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No invoices yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-xs">{inv.invoice_number ?? "—"}</TableCell>
                        <TableCell>
                          <p className="text-sm text-foreground">{inv.clients?.name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground font-mono">{inv.clients?.client_number ?? ""}</p>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {inv.period_start && inv.period_end
                            ? `${format(new Date(inv.period_start), "MMM d")} – ${format(new Date(inv.period_end), "MMM d")}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{Number(inv.total_hours).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">${Number(inv.hourly_rate).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          ${Number(inv.amount_due).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>{statusBadge(inv.status)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(inv.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPreviewId(inv.id)}
                              title="Preview what the client receives"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {inv.hosted_invoice_url && (
                              <Button size="sm" variant="ghost" asChild title="Open Stripe-hosted invoice">
                                <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <InvoicePreviewDialog
        invoiceId={previewId}
        onClose={() => setPreviewId(null)}
        onChanged={() => qc.invalidateQueries({ queryKey: ["hourly-invoices"] })}
      />
    </div>
  );
}

function InvoicePreviewDialog({
  invoiceId,
  onClose,
  onChanged,
}: {
  invoiceId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"finalize" | "send" | null>(null);

  const load = async (id: string) => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("preview-hourly-invoice", {
        body: { hourly_invoice_id: id },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error);
      setData(res);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load preview");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (invoiceId) {
      setData(null);
      void load(invoiceId);
    }
  }, [invoiceId]);

  const finalize = async (send: boolean) => {
    if (!invoiceId) return;
    setBusy(send ? "send" : "finalize");
    try {
      const { data: res, error } = await supabase.functions.invoke("finalize-hourly-invoice", {
        body: { hourly_invoice_id: invoiceId, send },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error);
      toast.success(send ? "Invoice finalized & emailed to client" : "Invoice finalized");
      onChanged();
      await load(invoiceId);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to finalize");
    } finally {
      setBusy(null);
    }
  };

  const inv = data?.invoice;
  const stripe = data?.stripe;
  const items: any[] = data?.line_items ?? [];
  const isDraft = (stripe?.status ?? inv?.status) === "draft";

  return (
    <Dialog open={!!invoiceId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4" /> Client invoice preview
          </DialogTitle>
          <DialogDescription>
            This is exactly what {inv?.clients?.name ?? "the client"} will see in their email and on the Stripe payment page.
          </DialogDescription>
        </DialogHeader>

        {loading || !data ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-auto space-y-4 pr-1">
            {/* Email-style preview card */}
            <div className="rounded-lg border bg-card">
              <div className="border-b px-5 py-3 text-xs text-muted-foreground space-y-0.5">
                <p><span className="font-medium text-foreground">To:</span> {inv?.clients?.email ?? "—"}</p>
                <p><span className="font-medium text-foreground">From:</span> Vektiss &lt;invoicing@stripe.com&gt;</p>
                <p><span className="font-medium text-foreground">Subject:</span> Invoice {stripe?.number ?? inv?.invoice_number ?? "(draft)"} from Vektiss</p>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Amount due</p>
                  <p className="text-3xl font-bold text-foreground">
                    ${Number(stripe?.amount_due ?? inv?.amount_due ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    <span className="ml-2 text-sm font-normal uppercase text-muted-foreground">{stripe?.currency ?? "usd"}</span>
                  </p>
                  {stripe?.due_date && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Due {format(new Date(stripe.due_date * 1000), "MMM d, yyyy")}
                    </p>
                  )}
                </div>

                {(stripe?.description || inv?.notes) && (
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {stripe?.description ?? inv?.notes}
                  </p>
                )}

                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">Description</th>
                        <th className="text-right px-3 py-2 w-24">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <tr><td colSpan={2} className="px-3 py-4 text-center text-muted-foreground">No line items</td></tr>
                      ) : items.map((li, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-3 py-2 align-top">{li.description}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            ${Number(li.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/30 border-t">
                      <tr>
                        <td className="px-3 py-2 text-right font-medium">Total</td>
                        <td className="px-3 py-2 text-right font-mono font-bold">
                          ${Number(stripe?.total ?? inv?.amount_due ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {stripe?.hosted_invoice_url ? (
                    <Button asChild size="sm">
                      <a href={stripe.hosted_invoice_url} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Pay invoice (Stripe)
                      </a>
                    </Button>
                  ) : (
                    <Button size="sm" disabled title="Available after finalize">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Pay invoice (Stripe)
                    </Button>
                  )}
                  {stripe?.invoice_pdf ? (
                    <Button asChild size="sm" variant="outline">
                      <a href={stripe.invoice_pdf} target="_blank" rel="noreferrer">
                        <Download className="h-3.5 w-3.5 mr-1.5" /> Download PDF
                      </a>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled title="PDF generated after finalize">
                      <Download className="h-3.5 w-3.5 mr-1.5" /> PDF (after finalize)
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground px-1">
              Status: <span className="font-medium text-foreground">{stripe?.status ?? inv?.status}</span>
              {stripe?.id && <> · Stripe ID: <span className="font-mono">{stripe.id}</span></>}
            </p>
          </div>
        )}

        {!loading && data && (
          <div className="border-t pt-3 flex flex-wrap justify-end gap-2">
            {isDraft && (
              <>
                <Button
                  variant="outline"
                  onClick={() => finalize(false)}
                  disabled={!!busy}
                >
                  {busy === "finalize" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                  Finalize only
                </Button>
                <Button onClick={() => finalize(true)} disabled={!!busy}>
                  {busy === "send" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Mail className="h-4 w-4 mr-1.5" />}
                  Finalize & email client
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}