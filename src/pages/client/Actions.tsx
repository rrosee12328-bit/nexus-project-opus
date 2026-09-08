/* eslint-disable @typescript-eslint/no-explicit-any -- Client action RPC types are generated after deployment. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Clock3, ExternalLink, FileUp, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ClientAction = {
  id: string;
  client_id: string;
  project_id: string | null;
  title: string;
  instructions: string | null;
  due_at: string | null;
  status: "pending" | "awaiting_review" | "completed" | "cancelled";
  source_type: "manual" | "onboarding";
  submitted_at: string | null;
};
type UpcomingCall = {
  id: string;
  title: string;
  starts_at: string;
  event_timezone: string;
  join_url: string | null;
  cancel_url: string | null;
  reschedule_url: string | null;
};

function formatInZone(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
}

export default function ClientActionsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ClientAction | null>(null);
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const clientId = useQuery({
    queryKey: ["my-client-id", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_client_id_for_user", { _user_id: user!.id });
      if (error) throw error;
      return data as string | null;
    },
    enabled: !!user?.id,
  });

  const actions = useQuery({
    queryKey: ["my-client-actions", clientId.data],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("client_action_items")
        .select("id, client_id, project_id, title, instructions, due_at, status, source_type, submitted_at")
        .neq("status", "cancelled").order("due_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as ClientAction[];
    },
    enabled: !!clientId.data,
  });

  const calls = useQuery({
    queryKey: ["my-upcoming-calls", clientId.data],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_my_upcoming_calls");
      if (error) throw error;
      return (data || []) as UpcomingCall[];
    },
    enabled: !!clientId.data,
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!selected || !clientId.data) return;
      let filePath: string | null = null;
      if (file) {
        filePath = `${clientId.data}/${selected.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
        const { error } = await supabase.storage.from("client-action-submissions").upload(filePath, file, { upsert: false });
        if (error) throw error;
      }
      const { error } = await (supabase as any).rpc("submit_my_client_action", {
        _action_id: selected.id,
        _submission_note: note.trim() || null,
        _submission_url: url.trim() || null,
        _submission_file_path: filePath,
      });
      if (error) {
        if (filePath) await supabase.storage.from("client-action-submissions").remove([filePath]);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-client-actions", clientId.data] });
      queryClient.invalidateQueries({ queryKey: ["client-action-count", clientId.data] });
      setSelected(null); setNote(""); setUrl(""); setFile(null);
      toast.success("Sent to Vektiss for review. Reminders are paused.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pending = actions.data?.filter((action) => action.status === "pending") || [];
  const submitted = actions.data?.filter((action) => action.status === "awaiting_review") || [];
  const completed = actions.data?.filter((action) => action.status === "completed") || [];

  return <div className="space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Your next steps</p><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Actions</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Send requested information here. Once you submit an item, reminders stop while the Vektiss team reviews it.</p></div>

    {calls.data?.length ? <Card className="overflow-hidden border-sky-500/20 bg-sky-500/[0.04]"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-5 w-5 text-sky-500" />Upcoming calls</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{calls.data.map((call) => <div key={call.id} className="rounded-xl border border-border bg-background/80 p-4"><p className="font-medium">{call.title}</p><p className="mt-1 text-sm text-muted-foreground">{formatInZone(call.starts_at, call.event_timezone)}</p><div className="mt-3 flex flex-wrap gap-2">{call.join_url && <Button size="sm" asChild><a href={call.join_url} target="_blank" rel="noreferrer">Join call <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a></Button>}{call.reschedule_url && <Button size="sm" variant="outline" asChild><a href={call.reschedule_url} target="_blank" rel="noreferrer">Reschedule</a></Button>}{call.cancel_url && <Button size="sm" variant="ghost" asChild><a href={call.cancel_url} target="_blank" rel="noreferrer">Cancel</a></Button>}</div></div>)}</CardContent></Card> : null}

    {actions.isLoading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : <>
      <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-semibold">Needs your attention</h2><Badge>{pending.length}</Badge></div>{pending.length === 0 ? <Card className="border-dashed"><CardContent className="flex flex-col items-center py-10 text-center"><CheckCircle2 className="h-9 w-9 text-emerald-500" /><p className="mt-3 font-medium">You&apos;re caught up</p><p className="mt-1 text-sm text-muted-foreground">No client actions are waiting right now.</p></CardContent></Card> : pending.map((action) => <Card key={action.id} className="border-amber-500/20"><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5"><div className="min-w-0 flex-1"><p className="font-semibold">{action.title}</p>{action.instructions && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{action.instructions}</p>}{action.project_id && <a href="/portal/projects" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">View related project <ExternalLink className="h-3 w-3" /></a>}{action.due_at && <p className={`mt-3 flex items-center gap-1.5 text-xs ${new Date(action.due_at) < new Date() ? "font-medium text-destructive" : "text-muted-foreground"}`}><Clock3 className="h-3.5 w-3.5" />{new Date(action.due_at) < new Date() ? "Overdue: " : "Due "}{formatInZone(action.due_at, "America/Chicago")}</p>}</div>{action.source_type === "onboarding" ? <Button className="w-full sm:w-auto" asChild><a href="/portal">Continue onboarding</a></Button> : <Button className="w-full sm:w-auto" onClick={() => setSelected(action)}><Send className="mr-1.5 h-4 w-4" />I sent it</Button>}</CardContent></Card>)}</section>
      {submitted.length > 0 && <section className="space-y-3"><h2 className="font-semibold">Awaiting Vektiss review</h2>{submitted.map((action) => <Card key={action.id}><CardContent className="flex items-center gap-3 p-4"><CheckCircle2 className="h-5 w-5 shrink-0 text-sky-500" /><div><p className="text-sm font-medium">{action.title}</p><p className="text-xs text-muted-foreground">Submitted. No reminders will be sent while we review it.</p></div></CardContent></Card>)}</section>}
      {completed.length > 0 && <section className="space-y-3"><h2 className="font-semibold text-muted-foreground">Completed</h2><div className="grid gap-2 sm:grid-cols-2">{completed.map((action) => <div key={action.id} className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-500" />{action.title}</div>)}</div></section>}
    </>}

    <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Send your update</DialogTitle></DialogHeader><div className="space-y-4"><div className="rounded-xl bg-muted/50 p-3"><p className="text-sm font-medium">{selected?.title}</p><p className="mt-1 text-xs text-muted-foreground">A note, link, or file is optional. Submitting confirms that you sent or completed the requested item.</p></div><div className="space-y-2"><Label htmlFor="action-note">Note</Label><Textarea id="action-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Tell us what you sent or anything we should know." /></div><div className="space-y-2"><Label htmlFor="action-url">Link</Label><Input id="action-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://drive.google.com/..." /></div><div className="space-y-2"><Label htmlFor="action-file">File</Label><label htmlFor="action-file" className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 text-sm hover:border-primary/40"><FileUp className="h-5 w-5 text-primary" /><span className="min-w-0 truncate">{file?.name || "Choose a file up to 50 MB"}</span></label><Input id="action-file" className="hidden" type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button><Button disabled={submit.isPending} onClick={() => submit.mutate()}>{submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm I sent it</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
