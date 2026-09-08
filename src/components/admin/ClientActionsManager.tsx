/* eslint-disable @typescript-eslint/no-explicit-any -- Client action types are generated after deployment. */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, ExternalLink, Loader2, Plus, RotateCcw, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ActionStatus = "pending" | "awaiting_review" | "completed" | "cancelled";
type ClientAction = {
  id: string;
  title: string;
  instructions: string | null;
  due_at: string | null;
  status: ActionStatus;
  source_type: "manual" | "onboarding";
  reminders_enabled_at: string | null;
  submission_note: string | null;
  submission_url: string | null;
  submission_file_path: string | null;
  submitted_at: string | null;
};

const statusStyle: Record<ActionStatus, string> = {
  pending: "border-amber-500/30 text-amber-600",
  awaiting_review: "border-sky-500/30 text-sky-600",
  completed: "border-emerald-500/30 text-emerald-600",
  cancelled: "text-muted-foreground",
};

export function ClientActionsManager({ clientId }: { clientId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [projectId, setProjectId] = useState("none");
  const [remindersEnabled, setRemindersEnabled] = useState(true);

  const actions = useQuery({
    queryKey: ["client-actions-admin", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("client_action_items")
        .select("id, title, instructions, due_at, status, source_type, reminders_enabled_at, submission_note, submission_url, submission_file_path, submitted_at")
        .eq("client_id", clientId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ClientAction[];
    },
  });

  const projects = useQuery({
    queryKey: ["client-action-projects", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, name").eq("client_id", clientId).order("name");
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    const channel = supabase.channel(`client-actions-admin-${clientId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "client_action_items", filter: `client_id=eq.${clientId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["client-actions-admin", clientId] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, queryClient]);

  const createAction = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Give the client action a title");
      const { error } = await (supabase as any).from("client_action_items").insert({
        client_id: clientId,
        title: title.trim(),
        instructions: instructions.trim() || null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        project_id: projectId === "none" ? null : projectId,
        reminders_enabled_at: remindersEnabled ? new Date().toISOString() : null,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-actions-admin", clientId] });
      setOpen(false);
      setTitle(""); setInstructions(""); setDueAt(""); setProjectId("none"); setRemindersEnabled(true);
      toast.success("Client action created");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ action, status }: { action: ClientAction; status: ActionStatus }) => {
      const changes: Record<string, unknown> = { status };
      if (status === "pending") {
        changes.reminders_enabled_at = new Date().toISOString();
        changes.reviewed_at = null;
        changes.reviewed_by = null;
      } else {
        changes.reminders_enabled_at = null;
      }
      if (status === "completed") {
        changes.reviewed_at = new Date().toISOString();
        changes.reviewed_by = user?.id;
      }
      const { error } = await (supabase as any).from("client_action_items").update(changes).eq("id", action.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-actions-admin", clientId] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const openSubmission = async (action: ClientAction) => {
    if (action.submission_url) window.open(action.submission_url, "_blank", "noopener,noreferrer");
    if (action.submission_file_path) {
      const { data, error } = await supabase.storage.from("client-action-submissions").createSignedUrl(action.submission_file_path, 3600);
      if (error) return toast.error(error.message);
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    }
  };

  const activeCount = actions.data?.filter((action) => action.status === "pending" || action.status === "awaiting_review").length || 0;

  return <Card className="border-primary/20">
    <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
      <div><CardTitle className="text-lg">Client Actions</CardTitle><p className="mt-1 text-xs text-muted-foreground">Only the client-safe wording below is visible in their portal.</p></div>
      <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" />Request action</Button>
    </CardHeader>
    <CardContent className="space-y-3">
      {actions.isLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
      {!actions.isLoading && !actions.data?.length && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">No client-facing actions yet.</p>}
      {actions.data?.map((action) => <div key={action.id} className="rounded-xl border border-border p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{action.title}</p><Badge variant="outline" className={`capitalize ${statusStyle[action.status]}`}>{action.status.replace("_", " ")}</Badge>{action.source_type === "onboarding" && <Badge variant="secondary">Automatic onboarding</Badge>}</div>
            {action.instructions && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{action.instructions}</p>}
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {action.due_at && <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />Due {format(new Date(action.due_at), "MMM d, yyyy 'at' h:mm a")}</span>}
              {action.status === "pending" && <span>{action.reminders_enabled_at ? "Daily reminders active" : "Reminders paused"}</span>}
            </div>
            {action.submitted_at && <div className="mt-3 rounded-lg bg-sky-500/5 p-3 text-sm"><p className="font-medium text-sky-600">Client submitted {format(new Date(action.submitted_at), "MMM d 'at' h:mm a")}</p>{action.submission_note && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{action.submission_note}</p>}{(action.submission_url || action.submission_file_path) && <Button variant="link" className="h-auto p-0 pt-2" onClick={() => openSubmission(action)}><ExternalLink className="mr-1 h-3.5 w-3.5" />Open submission</Button>}</div>}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {action.status === "awaiting_review" && <><Button size="sm" onClick={() => updateStatus.mutate({ action, status: "completed" })}><Check className="mr-1 h-4 w-4" />Approve</Button><Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ action, status: "pending" })}><RotateCcw className="mr-1 h-4 w-4" />Reopen</Button></>}
            {action.status === "pending" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => updateStatus.mutate({ action, status: "cancelled" })}><X className="mr-1 h-4 w-4" />Cancel</Button>}
          </div>
        </div>
      </div>)}
      {activeCount > 0 && <p className="text-xs text-muted-foreground">{activeCount} action{activeCount === 1 ? "" : "s"} currently need attention.</p>}
    </CardContent>

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Request a client action</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2"><Label htmlFor="client-action-title">Client-visible title</Label><Input id="client-action-title" value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="Record and upload this month's content" /></div>
        <div className="space-y-2"><Label htmlFor="client-action-instructions">Client-visible instructions</Label><Textarea id="client-action-instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Explain exactly what the client should send, without internal notes." className="min-h-28" /></div>
        <div className="space-y-2"><Label htmlFor="client-action-due">Due date and time</Label><Input id="client-action-due" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></div>
        <div className="space-y-2"><Label>Related project (optional)</Label><Select value={projectId} onValueChange={setProjectId}><SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger><SelectContent><SelectItem value="none">No project</SelectItem>{projects.data?.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="flex items-center justify-between rounded-xl border p-3"><div><p className="text-sm font-medium">Daily reminders</p><p className="text-xs text-muted-foreground">Include this in the 9 AM client summary.</p></div><Switch checked={remindersEnabled} onCheckedChange={setRemindersEnabled} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={createAction.isPending || !title.trim()} onClick={() => createAction.mutate()}>{createAction.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create action</Button></DialogFooter>
    </DialogContent></Dialog>
  </Card>;
}
