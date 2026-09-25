import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { clientWorkspaceLink } from "@/lib/clientJourney";
import { meetingTime } from "@/lib/meetingTime";
import { Button } from "@/components/ui/button";
import TaskDetailDialog from "@/components/tasks/TaskDetailDialog";
import type { Database } from "@/integrations/supabase/types";

type Run = { id: string; provider: string; last_error: string | null; updated_at: string };
type Task = Database["public"]["Tables"]["tasks"]["Row"];
export function TodayAttention() {
  const cache = useQueryClient();
  const [retrying, setRetrying] = useState<string | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const queries = useQuery({
    queryKey: ["today-attention", today], refetchInterval: 30_000,
    queryFn: async () => {
      const results = await Promise.all([
        supabase.from("tasks").select("*").is("archived_at", null).neq("status", "done").lt("due_date", today).order("due_date").limit(8),
        supabase.from("approval_requests").select("id, title, client_id").eq("status", "pending").order("created_at").limit(8),
        supabase.from("calendar_events").select("*").is("cancelled_at", null).in("event_type", ["calendly", "meeting", "call"]).gte("start_time", new Date().toISOString()).order("start_time").limit(8),
        supabase.from("stripe_invoices").select("id, client_id, amount_due, amount_paid, currency").in("status", ["open", "past_due"]).order("due_date").limit(8),
      ]);
      for (const result of results) if (result.error) throw result.error;
      return { tasks: results[0].data ?? [], approvals: results[1].data ?? [], calls: results[2].data ?? [], invoices: results[3].data ?? [] };
    },
  });
  const runs = useQuery({ queryKey: ["integration-failures"], refetchInterval: 30_000, queryFn: async () => {
    const { data, error } = await supabase.from("integration_runs" as never).select("id, provider, last_error, updated_at").eq("status", "failed").order("updated_at", { ascending: false }).limit(8);
    if (error) throw error;
    return (data ?? []) as unknown as Run[];
  } });
  const retry = async (id: string) => {
    setRetrying(id);
    try {
      const { data, error } = await supabase.functions.invoke("retry-integration", { body: { run_id: id } });
      if (error || data?.error) throw error || new Error(data.error);
      toast.success("Update synced");
      await cache.invalidateQueries({ queryKey: ["integration-failures"] });
      await cache.invalidateQueries({ queryKey: ["today-attention"] });
      await cache.invalidateQueries({ queryKey: ["client-workspace"] });
    } catch { toast.error("Update could not be retried. Check integration logs."); }
    finally { setRetrying(null); }
  };
  const data = queries.data;
  const groups = [
    { title: "Overdue work", rows: (data?.tasks ?? []).map(item => ({ id: item.id, label: item.title, detail: `Due ${item.due_date}`, task: item, href: "" })) },
    { title: "Awaiting approval", rows: (data?.approvals ?? []).map(item => ({ id: item.id, label: item.title, detail: "Waiting for client response", task: null, href: clientWorkspaceLink(item.client_id, "projects") })) },
    { title: "Upcoming calls", rows: (data?.calls ?? []).map(item => ({ id: item.id, label: item.title, detail: meetingTime(item.start_time, (item as typeof item & { event_timezone?: string }).event_timezone), task: null, href: item.client_id ? clientWorkspaceLink(item.client_id, "conversations") : "/admin/calendar" })) },
    { title: "Outstanding invoices", rows: (data?.invoices ?? []).map(item => ({ id: item.id, label: new Intl.NumberFormat("en-US", { style: "currency", currency: item.currency || "USD" }).format(Math.max(0, item.amount_due - item.amount_paid) / 100), detail: "Open client billing", task: null, href: clientWorkspaceLink(item.client_id, "billing") })) },
  ];
  return <section className="space-y-4">
    <div><h2 className="text-lg font-semibold">Needs your attention</h2><p className="text-sm text-muted-foreground">Your next decisions, in one place. Updates every 30 seconds.</p></div>
    {queries.isLoading ? <p role="status">Loading today's work...</p> : queries.error ? <div role="alert">Couldn't load today's work. <Button variant="outline" onClick={() => void queries.refetch()}>Retry</Button></div> : <div className="grid gap-4 md:grid-cols-2">{groups.map(group => <article key={group.title} className="min-w-0 rounded-2xl border bg-card p-4 sm:p-5"><h3 className="text-sm font-semibold">{group.title}</h3><div className="mt-3 divide-y">{group.rows.length === 0 ? <p className="py-4 text-sm text-muted-foreground">Nothing waiting here.</p> : group.rows.map(row => { const content = <><span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{row.label}</span><span className="text-xs text-muted-foreground">{row.detail}</span></span><ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" /></>; return row.task ? <button key={row.id} className="flex w-full items-center gap-3 py-3 text-left" onClick={() => setTask(row.task)}>{content}</button> : <Link key={row.id} to={row.href} className="flex items-center gap-3 py-3">{content}</Link>; })}</div></article>)}</div>}
    <article className="rounded-2xl border bg-card p-4 sm:p-5"><h3 className="text-sm font-semibold">Integration updates</h3>{runs.isLoading ? <p className="mt-3 text-sm">Checking updates...</p> : runs.error ? <p role="alert" className="mt-3 text-sm text-muted-foreground">Sync status unavailable. Check that the workspace migration is installed.</p> : runs.data?.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No failed updates recorded.</p> : runs.data?.map(run => <div key={run.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-3"><div><p className="text-sm font-medium capitalize">{run.provider} needs attention</p><p className="text-xs text-muted-foreground">{run.last_error} · {new Date(run.updated_at).toLocaleString()}</p></div><Button disabled={!!retrying} variant="outline" size="sm" onClick={() => void retry(run.id)}><RefreshCw className={`mr-2 h-4 w-4 ${retrying === run.id ? "animate-spin" : ""}`} />Retry update</Button></div>)}</article>
    <TaskDetailDialog task={task ? { ...task, clients: null } : null} open={!!task} onClose={() => setTask(null)} />
  </section>;
}
