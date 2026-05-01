import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format, startOfDay, endOfDay, subDays, subHours, formatDistanceToNowStrict } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Loader2, RefreshCw, Search, ChevronDown, ChevronRight, CalendarIcon, X, SlidersHorizontal, Check,
} from "lucide-react";

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

const REQUEST_ID_RE = UUID_RE; // request_id is also a UUID (x-request-id)
const REQUEST_ID_MAX = 64;

/** Returns null when valid (or empty), or a human-readable error string. */
function validateUuidField(value: string, label: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (v.length > REQUEST_ID_MAX) return `${label} is too long (max ${REQUEST_ID_MAX} chars)`;
  if (!UUID_RE.test(v)) return `${label} must be a valid UUID (e.g. 019de182-9ee4-7cb1-a96c-6b48c25f4e6c)`;
  return null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const parseDateParam = (v: string | null): Date | undefined => {
  if (!v || !DATE_RE.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00`);
  return isNaN(d.getTime()) ? undefined : d;
};
const fmtDateParam = (d: Date) => format(d, "yyyy-MM-dd");

// Canonical events emitted by generate-call-summary-pdf (kept in sync with the edge fn)
const KNOWN_EVENTS = [
  "request_received",
  "validation_passed_request",
  "validation_failed_request",
  "auth_ok",
  "auth_missing_bearer",
  "auth_invalid_token",
  "call_fetched",
  "call_fetch_failed",
  "sections_resolved",
  "key_decisions_unparsable",
  "transcript_invalid_type",
  "transcript_truncated",
  "pdf_generated",
  "unhandled_exception",
] as const;

function ExampleChips({
  label,
  values,
  onPick,
}: {
  label: string;
  values: { id: string; ts?: string | null }[];
  onPick: (v: string) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-2">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label} — click to filter
      </span>
      <div className="mt-1.5 flex flex-col gap-1">
        {values.map((v) => {
          let rel = "";
          if (v.ts) {
            try {
              rel = formatDistanceToNowStrict(new Date(v.ts), { addSuffix: true });
            } catch {
              rel = "";
            }
          }
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onPick(v.id)}
              title={`Filter by ${v.id}`}
              className="group flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1 text-left transition-colors hover:bg-muted hover:border-primary/40"
            >
              <span className="truncate font-mono text-[10px] text-foreground">
                {v.id.slice(0, 8)}…{v.id.slice(-4)}
              </span>
              {rel && (
                <span className="shrink-0 text-[10px] text-muted-foreground">{rel}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function PdfLogs() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize state from URL (run once via lazy initializers)
  const [callId, setCallId] = useState(() => searchParams.get("call_id") ?? "");
  const [requestId, setRequestId] = useState(() => searchParams.get("request_id") ?? "");
  const [level, setLevel] = useState<string>(() => {
    const l = searchParams.get("level");
    return l && ["all", "debug", "info", "warn", "error"].includes(l) ? l : "all";
  });
  const [limit, setLimit] = useState<number>(() => {
    const n = Number(searchParams.get("limit"));
    return [100, 200, 500, 1000].includes(n) ? n : 200;
  });
  const [fromDate, setFromDate] = useState<Date | undefined>(() => parseDateParam(searchParams.get("from")));
  const [toDate, setToDate] = useState<Date | undefined>(() => parseDateParam(searchParams.get("to")));

  // Advanced filters
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(() => {
    return !!(
      searchParams.get("user_id") ||
      searchParams.get("min_ms") ||
      searchParams.get("errors_only") ||
      searchParams.get("events")
    );
  });
  const [userId, setUserId] = useState(() => searchParams.get("user_id") ?? "");
  const [minMs, setMinMs] = useState<string>(() => searchParams.get("min_ms") ?? "");
  const [errorsOnly, setErrorsOnly] = useState<boolean>(() => searchParams.get("errors_only") === "1");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(() => {
    const raw = searchParams.get("events");
    if (!raw) return [];
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  });

  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Live validation errors (null when field is valid or empty)
  const callIdError = useMemo(() => validateUuidField(callId, "Call ID"), [callId]);
  const requestIdError = useMemo(() => validateUuidField(requestId, "Request ID"), [requestId]);
  const userIdError = useMemo(() => validateUuidField(userId, "user_id"), [userId]);
  const minMsError = useMemo<string | null>(() => {
    if (!minMs.trim()) return null;
    const n = Number(minMs);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return "Must be a non-negative integer";
    if (n > 600_000) return "Must be ≤ 600000ms";
    return null;
  }, [minMs]);
  const hasFieldErrors = !!(callIdError || requestIdError || userIdError || minMsError);

  // Union of canonical events + any seen in current rows (in case of new events)
  const eventOptions = useMemo(() => {
    const set = new Set<string>(KNOWN_EVENTS);
    for (const r of rows) if (r.event) set.add(r.event);
    return Array.from(set).sort();
  }, [rows]);

  const advancedActiveCount =
    (userId.trim() ? 1 : 0) +
    (minMs.trim() ? 1 : 0) +
    (errorsOnly ? 1 : 0) +
    (selectedEvents.length > 0 ? 1 : 0);

  // Recent example IDs taken from loaded rows (most recent first, deduped)
  const exampleCallIds = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; ts?: string | null }[] = [];
    for (const r of rows) {
      if (r.call_id && !seen.has(r.call_id)) {
        seen.add(r.call_id);
        out.push({ id: r.call_id, ts: r.created_at });
        if (out.length >= 3) break;
      }
    }
    return out;
  }, [rows]);

  const exampleRequestIds = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; ts?: string | null }[] = [];
    for (const r of rows) {
      if (r.request_id && !seen.has(r.request_id)) {
        seen.add(r.request_id);
        out.push({ id: r.request_id, ts: r.created_at });
        if (out.length >= 3) break;
      }
    }
    return out;
  }, [rows]);

  // Keep URL in sync with current filter state (replace, no history entry per keystroke)
  useEffect(() => {
    const next = new URLSearchParams();
    if (callId.trim()) next.set("call_id", callId.trim());
    if (requestId.trim()) next.set("request_id", requestId.trim());
    if (level !== "all") next.set("level", level);
    if (limit !== 200) next.set("limit", String(limit));
    if (fromDate) next.set("from", fmtDateParam(fromDate));
    if (toDate) next.set("to", fmtDateParam(toDate));
    if (userId.trim()) next.set("user_id", userId.trim());
    if (minMs.trim()) next.set("min_ms", minMs.trim());
    if (errorsOnly) next.set("errors_only", "1");
    if (selectedEvents.length > 0) next.set("events", selectedEvents.join(","));

    // Avoid no-op writes that cause extra renders
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [callId, requestId, level, limit, fromDate, toDate, userId, minMs, errorsOnly, selectedEvents, searchParams, setSearchParams]);

  const fetchLogs = async () => {
    if (hasFieldErrors) {
      toast.error("Fix the highlighted fields before searching");
      return;
    }
    setLoading(true);
    try {
      let q = supabase
        .from("pdf_endpoint_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      const cid = callId.trim();
      const rid = requestId.trim();
      if (cid) q = q.eq("call_id", cid);
      if (rid) q = q.eq("request_id", rid);
      if (level !== "all") q = q.eq("level", level);
      if (fromDate && toDate && fromDate > toDate) {
        toast.error("'From' date must be before 'To' date");
        setLoading(false);
        return;
      }
      if (fromDate) q = q.gte("created_at", startOfDay(fromDate).toISOString());
      if (toDate) q = q.lte("created_at", endOfDay(toDate).toISOString());
      if (userId.trim()) q = q.eq("user_id", userId.trim());
      if (minMs.trim()) q = q.gte("elapsed_ms", Number(minMs));
      if (errorsOnly) q = q.in("level", ["warn", "error"]);
      if (selectedEvents.length > 0) q = q.in("event", selectedEvents);

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
  }, [level, limit, fromDate, toDate, errorsOnly, selectedEvents]);

  const applyPreset = (preset: "1h" | "24h" | "7d" | "30d" | "clear") => {
    const now = new Date();
    if (preset === "clear") {
      setFromDate(undefined);
      setToDate(undefined);
      return;
    }
    const map = { "1h": subHours(now, 1), "24h": subHours(now, 24), "7d": subDays(now, 7), "30d": subDays(now, 30) };
    setFromDate(map[preset]);
    setToDate(now);
  };

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-4 space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Call ID</label>
              <Input
                placeholder="Paste a call UUID"
                value={callId}
                onChange={(e) => setCallId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !hasFieldErrors) fetchLogs();
                }}
                aria-invalid={!!callIdError}
                aria-describedby={callIdError ? "call-id-error" : undefined}
                className={cn(
                  callIdError && "border-destructive focus-visible:ring-destructive",
                )}
                maxLength={REQUEST_ID_MAX}
              />
              {callIdError && (
                <p id="call-id-error" className="text-xs text-destructive">
                  {callIdError}
                </p>
              )}
              {!callIdError && exampleCallIds.length > 0 && (
                <ExampleChips
                  label="Recent calls"
                  values={exampleCallIds}
                  onPick={(v) => setCallId(v)}
                />
              )}
            </div>
            <div className="lg:col-span-4 space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Request ID</label>
              <Input
                placeholder="Paste a request UUID"
                value={requestId}
                onChange={(e) => setRequestId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !hasFieldErrors) fetchLogs();
                }}
                aria-invalid={!!requestIdError}
                aria-describedby={requestIdError ? "request-id-error" : undefined}
                className={cn(
                  requestIdError && "border-destructive focus-visible:ring-destructive",
                )}
                maxLength={REQUEST_ID_MAX}
              />
              {requestIdError && (
                <p id="request-id-error" className="text-xs text-destructive">
                  {requestIdError}
                </p>
              )}
              {!requestIdError && exampleRequestIds.length > 0 && (
                <ExampleChips
                  label="Recent requests"
                  values={exampleRequestIds}
                  onPick={(v) => setRequestId(v)}
                />
              )}
            </div>
            <div className="lg:col-span-2 space-y-1.5">
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
            <div className="lg:col-span-2 flex gap-2">
              <Button onClick={fetchLogs} disabled={loading || hasFieldErrors} className="flex-1">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-2">Search</span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={fetchLogs}
                disabled={loading || hasFieldErrors}
                aria-label="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end mt-3">
            <div className="lg:col-span-3 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !fromDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fromDate ? format(fromDate, "PPP") : <span>Pick a start date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fromDate}
                    onSelect={setFromDate}
                    disabled={(d) => (toDate ? d > toDate : false) || d > new Date()}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="lg:col-span-3 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !toDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {toDate ? format(toDate, "PPP") : <span>Pick an end date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={toDate}
                    onSelect={setToDate}
                    disabled={(d) => (fromDate ? d < fromDate : false) || d > new Date()}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="lg:col-span-6 sm:col-span-2 flex flex-wrap items-end gap-2">
              <span className="text-xs text-muted-foreground mr-1">Quick:</span>
              {([
                ["1h", "Last hour"],
                ["24h", "Last 24h"],
                ["7d", "Last 7d"],
                ["30d", "Last 30d"],
              ] as const).map(([k, label]) => (
                <Button
                  key={k}
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => applyPreset(k)}
                >
                  {label}
                </Button>
              ))}
              {(fromDate || toDate) && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => applyPreset("clear")}
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Clear dates
                </Button>
              )}
            </div>
          </div>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="mt-4">
            <div className="flex items-center justify-between border-t border-border pt-3">
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="gap-2 -ml-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  Advanced
                  {advancedActiveCount > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                      {advancedActiveCount}
                    </Badge>
                  )}
                  {advancedOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              {advancedActiveCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setUserId("");
                    setMinMs("");
                    setErrorsOnly(false);
                    setSelectedEvents([]);
                  }}
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Reset advanced
                </Button>
              )}
            </div>

            <CollapsibleContent className="mt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-start">
                {/* user_id */}
                <div className="lg:col-span-4 sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">user_id (UUID)</label>
                  <Input
                    placeholder="Filter by the user who triggered the request"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !hasFieldErrors) fetchLogs();
                    }}
                    aria-invalid={!!userIdError}
                    className={cn(userIdError && "border-destructive focus-visible:ring-destructive")}
                    maxLength={REQUEST_ID_MAX}
                  />
                  {userIdError && (
                    <p className="text-xs text-destructive">{userIdError}</p>
                  )}
                </div>

                {/* min elapsed_ms */}
                <div className="lg:col-span-3 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Min elapsed (ms)
                  </label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={50}
                    placeholder="e.g. 1000"
                    value={minMs}
                    onChange={(e) => setMinMs(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !hasFieldErrors) fetchLogs();
                    }}
                    aria-invalid={!!minMsError}
                    className={cn(minMsError && "border-destructive focus-visible:ring-destructive")}
                  />
                  {minMsError && (
                    <p className="text-xs text-destructive">{minMsError}</p>
                  )}
                </div>

                {/* errors only */}
                <div className="lg:col-span-2 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Errors only</label>
                  <div className="h-10 flex items-center gap-2 rounded-md border border-input px-3">
                    <Switch
                      id="errors-only"
                      checked={errorsOnly}
                      onCheckedChange={setErrorsOnly}
                    />
                    <label htmlFor="errors-only" className="text-xs text-muted-foreground cursor-pointer">
                      warn + error
                    </label>
                  </div>
                </div>

                {/* events multi-select */}
                <div className="lg:col-span-3 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Events {selectedEvents.length > 0 && `(${selectedEvents.length})`}
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between font-normal"
                      >
                        <span className="truncate">
                          {selectedEvents.length === 0
                            ? "All events"
                            : selectedEvents.length === 1
                              ? selectedEvents[0]
                              : `${selectedEvents.length} selected`}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start">
                      <div className="max-h-72 overflow-auto py-1">
                        {eventOptions.map((ev) => {
                          const checked = selectedEvents.includes(ev);
                          return (
                            <button
                              key={ev}
                              type="button"
                              onClick={() =>
                                setSelectedEvents((curr) =>
                                  curr.includes(ev)
                                    ? curr.filter((x) => x !== ev)
                                    : [...curr, ev],
                                )
                              }
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono hover:bg-muted"
                            >
                              <span
                                className={cn(
                                  "h-4 w-4 shrink-0 rounded-sm border border-input flex items-center justify-center",
                                  checked && "bg-primary border-primary text-primary-foreground",
                                )}
                              >
                                {checked && <Check className="h-3 w-3" />}
                              </span>
                              <span className="truncate">{ev}</span>
                            </button>
                          );
                        })}
                      </div>
                      {selectedEvents.length > 0 && (
                        <div className="border-t border-border p-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => setSelectedEvents([])}
                          >
                            Clear selection
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                  {selectedEvents.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {selectedEvents.map((ev) => (
                        <Badge
                          key={ev}
                          variant="secondary"
                          className="font-mono text-[10px] gap-1 cursor-pointer"
                          onClick={() =>
                            setSelectedEvents((curr) => curr.filter((x) => x !== ev))
                          }
                        >
                          {ev}
                          <X className="h-3 w-3" />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
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
                  <TableHead className="whitespace-nowrap">Request</TableHead>
                  <TableHead className="whitespace-nowrap">Call</TableHead>
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
                        <TableCell className="align-top">
                          <button
                            type="button"
                            title={`${r.request_id} — click to filter & copy`}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(r.request_id);
                              toast.success("Request ID copied");
                              setRequestId(r.request_id);
                            }}
                            className="inline-flex items-center font-mono text-[11px] rounded-md border border-border bg-muted/40 hover:bg-muted hover:border-primary/40 px-2 py-0.5 transition-colors max-w-full"
                          >
                            <span className="truncate">
                              {r.request_id.slice(0, 8)}…{r.request_id.slice(-4)}
                            </span>
                          </button>
                        </TableCell>
                        <TableCell className="align-top">
                          {r.call_id ? (
                            <button
                              type="button"
                              title={`${r.call_id} — click to filter & copy`}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(r.call_id!);
                                toast.success("Call ID copied");
                                setCallId(r.call_id!);
                              }}
                              className="inline-flex items-center font-mono text-[11px] rounded-md border border-border bg-muted/40 hover:bg-muted hover:border-primary/40 px-2 py-0.5 transition-colors max-w-full"
                            >
                              <span className="truncate">
                                {r.call_id.slice(0, 8)}…{r.call_id.slice(-4)}
                              </span>
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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