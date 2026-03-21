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
import { CheckCircle2, XCircle, Clock, Plus, Send } from "lucide-react";

interface ApprovalsPanelProps {
  projectId: string;
  clientId: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "Pending", color: "text-amber-500", icon: Clock },
  approved: { label: "Approved", color: "text-emerald-500", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "text-destructive", icon: XCircle },
};

export function ApprovalsPanel({ projectId, clientId }: ApprovalsPanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
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

  const submitApproval = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Title is required");
      const { error } = await supabase.from("approval_requests").insert({
        project_id: projectId,
        client_id: clientId,
        title: title.trim(),
        description: description.trim() || null,
        phase: phase || null,
        submitted_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Approval request sent to client");
      queryClient.invalidateQueries({ queryKey: ["approvals", projectId] });
      setFormOpen(false);
      setTitle("");
      setDescription("");
      setPhase("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Client Approvals</h3>
        <Button size="sm" variant="outline" onClick={() => setFormOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Request Approval
        </Button>
      </div>

      {approvals.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No approval requests yet</p>
      ) : (
        <div className="space-y-2">
          {approvals.map((a: any) => {
            const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending;
            return (
              <div key={a.id} className="rounded-lg border border-border p-3 flex items-start gap-3">
                <div className={`h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5`}>
                  <cfg.icon className={`h-4 w-4 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{a.title}</p>
                    <Badge variant="outline" className={`text-[10px] h-4 px-1 ${cfg.color}`}>{cfg.label}</Badge>
                  </div>
                  {a.description && <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>}
                  {a.phase && <span className="text-[10px] text-muted-foreground">Phase: {a.phase}</span>}
                  {a.response_note && (
                    <p className="text-xs mt-1 italic text-muted-foreground">"{a.response_note}"</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {format(new Date(a.created_at), "MMM d, yyyy")}
                    {a.responded_at && ` · Responded ${format(new Date(a.responded_at), "MMM d")}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" /> Request Client Approval
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Homepage design mockup" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the client needs to review..." rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Phase</Label>
              <Select value={phase} onValueChange={setPhase}>
                <SelectTrigger><SelectValue placeholder="Select phase" /></SelectTrigger>
                <SelectContent>
                  {["discovery", "design", "development", "review", "launch", "deploy"].map((p) => (
                    <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={() => submitApproval.mutate()} disabled={submitApproval.isPending}>
              {submitApproval.isPending ? "Sending..." : "Send to Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
