import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Clock, ExternalLink, FileCheck, Lightbulb, Video, XCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  approvalResponseActionLabel,
  approvalResponseNeedsNote,
  approvalStatusLabel,
  type ClientApprovalResponse,
} from "@/lib/approvalStatus";

const STATUS_CONFIG: Record<string, { color: string; icon: typeof Clock }> = {
  pending: { color: "text-amber-500", icon: Clock },
  approved: { color: "text-emerald-500", icon: CheckCircle2 },
  rejected: { color: "text-destructive", icon: XCircle },
  suggestions: { color: "text-violet-500", icon: Lightbulb },
};

export function ClientApprovals() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseNote, setResponseNote] = useState("");
  const [selectedResponse, setSelectedResponse] = useState<ClientApprovalResponse | null>(null);

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ["client-approvals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approval_requests")
        .select("*, projects(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const closeResponse = () => {
    setRespondingId(null);
    setResponseNote("");
    setSelectedResponse(null);
  };

  const respond = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ClientApprovalResponse }) => {
      if (approvalResponseNeedsNote(status) && !responseNote.trim()) {
        throw new Error(status === "suggestions" ? "Add your suggestions before sending" : "Tell the team what needs to change");
      }
      const { error } = await supabase
        .from("approval_requests")
        .update({
          status,
          responded_at: new Date().toISOString(),
          response_note: responseNote.trim() || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      const message = status === "approved" ? "Video approved" : status === "suggestions" ? "Suggestions sent to the team" : "Changes requested";
      toast.success(message);
      void queryClient.invalidateQueries({ queryKey: ["client-approvals"] });
      void queryClient.invalidateQueries({ queryKey: ["pending-approval-count"] });
      closeResponse();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to submit your response"),
  });

  const pending = approvals.filter((approval) => approval.status === "pending");
  const resolved = approvals.filter((approval) => approval.status !== "pending");

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold tracking-tight">Video reviews</h1>
        <p className="text-sm text-muted-foreground">Watch completed videos from Dropbox, then approve, decline, or send suggestions to your team.</p>
      </motion.div>

      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Needs your review ({pending.length})</h2>
          {pending.map((approval, index) => {
            const cfg = STATUS_CONFIG.pending;
            const Icon = cfg.icon;
            const isResponding = respondingId === approval.id;
            const requiresNote = selectedResponse ? approvalResponseNeedsNote(selectedResponse) : false;
            return (
              <motion.div key={approval.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * index }}>
                <Card className="border-amber-500/30">
                  <CardContent className="space-y-3 pb-5 pt-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10"><Icon className={`h-5 w-5 ${cfg.color}`} /></div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{approval.title}</p>
                        {approval.projects?.name && <p className="text-xs text-muted-foreground">Project: {approval.projects.name}</p>}
                        {approval.description && <p className="mt-1 text-sm text-muted-foreground">{approval.description}</p>}
                        {approval.review_url ? (
                          <Button variant="outline" size="sm" className="mt-3" asChild>
                            <a href={approval.review_url} target="_blank" rel="noopener noreferrer">
                              <Video className="mr-2 h-4 w-4" /> Watch Dropbox video <ExternalLink className="ml-2 h-3.5 w-3.5" />
                            </a>
                          </Button>
                        ) : <p className="mt-3 text-xs text-muted-foreground">A video link was not included with this legacy request.</p>}
                        {approval.phase && <Badge variant="outline" className="ml-2 mt-3 text-[10px]">{approval.phase}</Badge>}
                        <p className="mt-2 text-[10px] text-muted-foreground">Sent {format(new Date(approval.created_at), "MMMM d, yyyy")}</p>
                      </div>
                    </div>

                    {isResponding ? (
                      <div className="space-y-3 border-t border-border pt-3">
                        <div className="space-y-2">
                          <label className="text-sm font-medium" htmlFor={`feedback-${approval.id}`}>
                            {requiresNote ? "Your feedback *" : "Optional note"}
                          </label>
                          <Textarea
                            id={`feedback-${approval.id}`}
                            value={responseNote}
                            onChange={(event) => setResponseNote(event.target.value)}
                            placeholder={selectedResponse === "rejected" ? "Tell us what needs to change…" : selectedResponse === "suggestions" ? "Share your ideas or specific edits…" : "Add a note for your team…"}
                            rows={3}
                            maxLength={3000}
                          />
                        </div>
                        {selectedResponse ? (
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant={selectedResponse === "rejected" ? "destructive" : "default"} onClick={() => respond.mutate({ id: approval.id, status: selectedResponse })} disabled={respond.isPending}>
                              {respond.isPending ? "Sending…" : approvalResponseActionLabel(selectedResponse)}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setSelectedResponse(null)} disabled={respond.isPending}>Back</Button>
                            <Button size="sm" variant="ghost" onClick={closeResponse} disabled={respond.isPending}>Cancel</Button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => respond.mutate({ id: approval.id, status: "approved" })} disabled={respond.isPending}>
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve video
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => setSelectedResponse("rejected")} disabled={respond.isPending}>
                              <XCircle className="mr-1 h-3.5 w-3.5" /> Decline / request changes
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setSelectedResponse("suggestions")} disabled={respond.isPending}>
                              <Lightbulb className="mr-1 h-3.5 w-3.5" /> Send suggestions
                            </Button>
                            <Button size="sm" variant="ghost" onClick={closeResponse} disabled={respond.isPending}>Cancel</Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="pt-2"><Button size="sm" onClick={() => setRespondingId(approval.id)}><FileCheck className="mr-1 h-3.5 w-3.5" /> Review & respond</Button></div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Previous decisions ({resolved.length})</h2>
          {resolved.map((approval) => {
            const cfg = STATUS_CONFIG[approval.status] || STATUS_CONFIG.pending;
            const Icon = cfg.icon;
            return (
              <Card key={approval.id} className="opacity-80">
                <CardContent className="pb-4 pt-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Icon className={`h-4 w-4 ${cfg.color}`} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{approval.title}</p><Badge variant="outline" className={`h-4 px-1 text-[10px] ${cfg.color}`}>{approvalStatusLabel(approval.status)}</Badge></div>
                      {approval.projects?.name && <p className="text-xs text-muted-foreground">Project: {approval.projects.name}</p>}
                      {approval.review_url ? <Button variant="link" size="sm" className="h-auto p-0 pt-1 text-xs" asChild><a href={approval.review_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" /> Open Dropbox video</a></Button> : <p className="pt-1 text-xs text-muted-foreground">No video link was included.</p>}
                      {approval.response_note && <p className="mt-1 text-xs italic text-muted-foreground">“{approval.response_note}”</p>}
                      {approval.responded_at && <p className="mt-1 text-[10px] text-muted-foreground">Responded {format(new Date(approval.responded_at), "MMM d, yyyy")}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {approvals.length === 0 && !isLoading && (
        <Card><CardContent className="flex flex-col items-center justify-center gap-3 py-16"><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"><Video className="h-8 w-8 text-primary/40" /></div><p className="text-sm text-muted-foreground">No videos are waiting for your review.</p></CardContent></Card>
      )}
    </div>
  );
}
