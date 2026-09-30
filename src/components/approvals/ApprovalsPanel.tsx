import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { CheckCircle2, Clock, ExternalLink, Lightbulb, Plus, Send, Video, XCircle } from "lucide-react";
import { approvalStatusLabel } from "@/lib/approvalStatus";
import { normalizeDropboxReviewUrl } from "@/lib/reviewUrl";

interface ApprovalsPanelProps {
  projectId: string;
  clientId: string;
}

const STATUS_CONFIG: Record<string, { color: string; icon: typeof Clock }> = {
  pending: { color: "text-amber-500", icon: Clock },
  approved: { color: "text-emerald-500", icon: CheckCircle2 },
  rejected: { color: "text-destructive", icon: XCircle },
  suggestions: { color: "text-violet-500", icon: Lightbulb },
};

export function ApprovalsPanel({ projectId, clientId }: ApprovalsPanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reviewUrl, setReviewUrl] = useState("");
  const [phase, setPhase] = useState("");

  const { data: approvals = [] } = useQuery({
    queryKey: ["approvals", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approval_requests")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const closeForm = () => {
    setFormOpen(false);
    setTitle("");
    setDescription("");
    setReviewUrl("");
    setPhase("");
  };

  const submitApproval = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("You must be signed in to send a video for review");
      if (!title.trim()) throw new Error("A video title is required");

      const normalizedReviewUrl = normalizeDropboxReviewUrl(reviewUrl);
      if (!normalizedReviewUrl) {
        throw new Error("Enter a secure Dropbox shared-video link");
      }

      const { error } = await supabase.from("approval_requests").insert({
        project_id: projectId,
        client_id: clientId,
        title: title.trim(),
        description: description.trim() || null,
        review_url: normalizedReviewUrl,
        phase: phase || null,
        submitted_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dropbox video sent for client review");
      void queryClient.invalidateQueries({ queryKey: ["approvals", projectId] });
      closeForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Video reviews</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Send a completed Dropbox video to the client for a decision.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setFormOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Send video
        </Button>
      </div>

      {approvals.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">No completed videos have been sent for review.</p>
      ) : (
        <div className="space-y-2">
          {approvals.map((approval) => {
            const cfg = STATUS_CONFIG[approval.status] || STATUS_CONFIG.pending;
            const Icon = cfg.icon;
            return (
              <div key={approval.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className={`h-4 w-4 ${cfg.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{approval.title}</p>
                    <Badge variant="outline" className={`h-4 px-1 text-[10px] ${cfg.color}`}>{approvalStatusLabel(approval.status)}</Badge>
                  </div>
                  {approval.description && <p className="mt-0.5 text-xs text-muted-foreground">{approval.description}</p>}
                  {approval.review_url ? (
                    <Button variant="link" size="sm" className="h-auto p-0 pt-1 text-xs" asChild>
                      <a href={approval.review_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open Dropbox video
                      </a>
                    </Button>
                  ) : <p className="pt-1 text-xs text-muted-foreground">No Dropbox video link was included.</p>}
                  {approval.phase && <span className="ml-2 text-[10px] text-muted-foreground">Phase: {approval.phase}</span>}
                  {approval.response_note && <p className="mt-1 text-xs italic text-muted-foreground">“{approval.response_note}”</p>}
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Sent {format(new Date(approval.created_at), "MMM d, yyyy")}
                    {approval.responded_at && ` · Client responded ${format(new Date(approval.responded_at), "MMM d")}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(open) => (open ? setFormOpen(true) : closeForm())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Send className="h-4 w-4" /> Send completed video for review</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="approval-title">Video title *</Label>
              <Input id="approval-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. September social campaign — cut 1" maxLength={160} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="approval-description">Review notes</Label>
              <Textarea id="approval-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What should the client look for?" rows={3} maxLength={2000} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="approval-review-url">Completed-video Dropbox link *</Label>
              <div className="relative">
                <Video className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="approval-review-url" type="url" value={reviewUrl} onChange={(event) => setReviewUrl(event.target.value)} placeholder="https://www.dropbox.com/..." className="pl-9" />
              </div>
              <p className="text-xs text-muted-foreground">Use a view-only Dropbox share link. The app opens it in Dropbox’s viewer, not as a download.</p>
            </div>
            <div className="space-y-2">
              <Label>Project phase</Label>
              <Select value={phase} onValueChange={setPhase}>
                <SelectTrigger><SelectValue placeholder="Select phase (optional)" /></SelectTrigger>
                <SelectContent>
                  {["discovery", "design", "development", "review", "launch", "deploy"].map((item) => (
                    <SelectItem key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button onClick={() => submitApproval.mutate()} disabled={submitApproval.isPending}>
              {submitApproval.isPending ? "Sending…" : "Send to client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
