import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search, ChevronDown, ChevronRight } from "lucide-react";

type LogRow = {
  id: string;
  created_at: string;
  request_id: string;
  call_id: string | null;
  user_id: string | null;
  fn: string;
  level: "debug" | "info" | "warn" | "error";
  event: string;
  elapsed_ms: number | null;
  data: Record<string, unknown>;
};

const LEVEL_VARIANT: Record<LogRow["level"], string> = {
  debug: "bg-muted text-muted-foreground",
  info: "bg-primary/10 text-primary",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  error: "bg-destructive/15 text-destructive",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function PdfLogs() {
  const [callId, setCallId] = useState("");
  const [requestId, setRequestId] = useState("");
  const [level, setLevel] = useState<string>("all");
  const [limit, setLimit] = useState<number>(200);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("pdf_endpoint_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      const cid = callId.trim();
      const rid = requestId.trim();
      if (cid) {
        if (!UUID_RE.test(cid)) {
          toast.error("call_id must be a valid UUID");
          setLoading(false);
          return;
        }
        q = q.eq("call_id", cid);
      }
      if (rid) q = q.eq("request_id", rid);
      if (level !== "all") q = q.eq("level", level);

      const { data, error } = await q;
      if (error) throw error;
      setRows((data ?? []) as LogRow[]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const m = new Map<string, LogRow[]>();
    for (const r of rows) {
      const arr = m.get(r.request_id) ?? [];
      arr.push(r);
      m.set(r.request_id, arr);
    }
    return m;
  }, [rows]);

  const toggle = (id: string) =>
    setExpanded((e) => ({ ...e, [id]: !e[id] }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">PDF Endpoint Logs</h1>
        <p className="text-sm text-muted-foreground">
          Structured events from <code className="text-xs">generate-call-summary-pdf</code>.
          Filter by call ID or request ID to investigate a specific download.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">call_id (UUID)</label>
              <Input
                placeholder="e.g. 019de182-9ee4-7cb1-a96c-6b48c25f4e6c"
                value={callId}
                onChange={(e) => setCallId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchLogs()}
              />
            </div>
            <div className="md:col-span-4 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">request_id</label>
              <Input
                placeholder="x-request-id from response header"
                value={requestId}
                onChange={(e) => setRequestId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchLogs()}
              />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Level</label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="debug">Debug</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warn">Warn</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 flex gap-2">
              <Button onClick={fetchLogs} disabled={loading} className="flex-1">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-2">Search</span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={fetchLogs}
                disabled={loading}
                aria-label="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Events <span className="text-muted-foreground font-normal">({rows.length})</span>
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Limit</span>
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[100, 200, 500, 1000].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="hidden md:inline">
              {grouped.size} request{grouped.size === 1 ? "" : "s"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead className="whitespace-nowrap">Time</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead className="whitespace-nowrap">Elapsed</TableHead>
                  <TableHead>request_id</TableHead>
                  <TableHead>call_id</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                      No events found.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => {
                  const open = !!expanded[r.id];
                  const hasData = r.data && Object.keys(r.data).length > 0;
                  return (
                    <Fragment key={r.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => toggle(r.id)}
                      >
                        <TableCell className="align-top">
                          {hasData ? (
                            open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap align-top">
                          {new Date(r.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant="outline" className={`uppercase ${LEVEL_VARIANT[r.level]}`}>
                            {r.level}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs align-top">{r.event}</TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap align-top">
                          {r.elapsed_ms ?? 0}ms
                        </TableCell>
                        <TableCell
                          className="font-mono text-[11px] max-w-[200px] truncate align-top"
                          title={r.request_id}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(r.request_id);
                            toast.success("request_id copied");
                            setRequestId(r.request_id);
                          }}
                        >
                          {r.request_id}
                        </TableCell>
                        <TableCell
                          className="font-mono text-[11px] max-w-[200px] truncate align-top"
                          title={r.call_id ?? ""}
                          onClick={(e) => {
                            if (!r.call_id) return;
                            e.stopPropagation();
                            navigator.clipboard.writeText(r.call_id);
                            toast.success("call_id copied");
                            setCallId(r.call_id);
                          }}
                        >
                          {r.call_id ?? "—"}
                        </TableCell>
                      </TableRow>
                      {open && hasData && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell />
                          <TableCell colSpan={6}>
                            <pre className="text-xs whitespace-pre-wrap break-all font-mono leading-relaxed text-muted-foreground">
{JSON.stringify(r.data, null, 2)}
                            </pre>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}