/* eslint-disable @typescript-eslint/no-explicit-any -- New Supabase tables are typed after the migration is deployed. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type SessionRow = {
  id: string;
  client_id: string;
  method: string | null;
  status: string;
  approved_summary: string | null;
  completed_at: string | null;
  updated_at: string;
  clients: { name: string; email: string | null } | null;
};
type ResponseRow = {
  id: string;
  question_prompt: string;
  answer_text: string | null;
  transcript_text: string | null;
  recording_path: string | null;
  recording_url?: string | null;
};

export function OnboardingSessionsReview() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<SessionRow | null>(null);
  const sessions = useQuery({
    queryKey: ["admin-onboarding-sessions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("onboarding_sessions")
        .select("id, client_id, method, status, approved_summary, completed_at, updated_at, clients(name, email)")
        .order("updated_at", { ascending: false }).limit(30);
      if (error) throw error;
      return (data || []) as SessionRow[];
    },
  });
  const responses = useQuery({
    queryKey: ["admin-onboarding-responses", selected?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("onboarding_responses")
        .select("id, question_prompt, answer_text, transcript_text, recording_path")
        .eq("session_id", selected!.id).order("created_at");
      if (error) throw error;
      return Promise.all(((data || []) as ResponseRow[]).map(async (response) => {
        if (!response.recording_path) return response;
        const { data: signed } = await supabase.storage.from("onboarding-recordings").createSignedUrl(response.recording_path, 3600);
        return { ...response, recording_url: signed?.signedUrl || null };
      }));
    },
    enabled: !!selected,
  });
  const deleteRecording = useMutation({
    mutationFn: async (response: ResponseRow) => {
      if (!response.recording_path) return;
      const { error: storageError } = await supabase.storage.from("onboarding-recordings").remove([response.recording_path]);
      if (storageError) throw storageError;
      const { error } = await (supabase as any).from("onboarding_responses").update({ recording_path: null }).eq("id", response.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-onboarding-responses", selected?.id] }); toast.success("Recording deleted; transcript retained"); },
    onError: (error: Error) => toast.error(error.message),
  });

  return <div className="mt-8 space-y-3">
    <div><h3 className="text-sm font-semibold">Recent Onboarding Sessions</h3><p className="mt-0.5 text-xs text-muted-foreground">Review progress, approved briefs, transcripts, and retained recordings.</p></div>
    {sessions.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <div className="space-y-2">{sessions.data?.map((session) => <div key={session.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{session.clients?.name || "Client"}</p><p className="truncate text-xs text-muted-foreground">{session.method?.replace("_", " ") || "Not selected"} · Updated {new Date(session.updated_at).toLocaleDateString()}</p></div>
      <Badge variant={session.status === "completed" ? "default" : "secondary"} className="capitalize">{session.status.replace("_", " ")}</Badge>
      <Button variant="ghost" size="icon" onClick={() => setSelected(session)}><Eye className="h-4 w-4" /></Button>
    </div>)}</div>}

    <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{selected?.clients?.name} onboarding</DialogTitle></DialogHeader>
      {selected?.approved_summary && <div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">Approved brief</p><p className="whitespace-pre-wrap text-sm leading-6">{selected.approved_summary}</p></div>}
      <div className="space-y-3">{responses.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : responses.data?.map((response) => <div key={response.id} className="rounded-xl border border-border p-4"><p className="text-sm font-semibold">{response.question_prompt}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{response.transcript_text || response.answer_text || "No transcript available"}</p>{response.recording_url && <div className="mt-3 flex items-center gap-2"><audio controls src={response.recording_url} className="min-w-0 flex-1" /><Button variant="ghost" size="icon" className="shrink-0 text-destructive" title="Delete original recording" onClick={() => deleteRecording.mutate(response)}><Trash2 className="h-4 w-4" /></Button></div>}</div>)}</div>
    </DialogContent></Dialog>
  </div>;
}
