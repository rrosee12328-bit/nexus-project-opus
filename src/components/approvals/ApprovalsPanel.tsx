import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { CheckCircle2, Clock, ExternalLink, Eye, Lightbulb, Plus, Send, Video, XCircle } from "lucide-react";
import { approvalStatusLabel } from "@/lib/approvalStatus";
import { createDropboxImportedVideoItems } from "@/lib/dropboxVideoImport";
import { buildVideoReviewItems, createVideoReviewDraftItem, type VideoReviewDraftItem } from "@/lib/videoReviewItems";
import { VideoReviewItemFields } from "@/components/approvals/VideoReviewItemFields";
import { useDropboxVideoReviewImport } from "@/hooks/useDropboxVideoReviewImport";

type ApprovalItem = Database["public"]["Tables"]["approval_request_items"]["Row"];
type ApprovalWithItems = Database["public"]["Tables"]["approval_requests"]["Row"] & {
  approval_request_items: ApprovalItem[] | null;
};

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

export function ApprovalsPanel({ projectId }: ApprovalsPanelProps) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reviewUrl, setReviewUrl] = useState("");
  const [phase, setPhase] = useState("");
  const [videoItems, setVideoItems] = useState<VideoReviewDraftItem[]>([createVideoReviewDraftItem()]);
  const { connectionQuery: dropboxConnectionQuery, importMutation: importDropboxTitles } = useDropboxVideoReviewImport();

  const { data: approvals = [] } = useQuery({
    queryKey: ["approvals", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approval_requests")
        .select("*, approval_request_items(*)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ApprovalWithItems[];
    },
  });

  const closeForm = () => {
    setFormOpen(false);
    setTitle("");
    setDescription("");
    setReviewUrl("");
    setPhase("");
    setVideoItems([createVideoReviewDraftItem()]);
  };

  const importDropboxFolderTitles = () => {
    if (!reviewUrl.trim()) {
      toast.error("Paste the Dropbox folder link before importing creative files");
      return;
    }
    if (!dropboxConnectionQuery.data?.connected) {
      toast.error("Dropbox import is not connected. An admin can connect it under Settings → Integrations.");
      return;
    }

    importDropboxTitles.mutate(reviewUrl, {
      onSuccess: (result) => {
        const importedItems = createDropboxImportedVideoItems(result.items);
        if (!importedItems.length) {
          toast.error("No video or graphic filenames could be imported from that folder");
          return;
        }
        setVideoItems(importedItems);
        toast.success(`${importedItems.length} creative item${importedItems.length === 1 ? "" : "s"} imported from ${result.folderName}`);
        if (result.truncated) toast.message("Only the first 10,000 creative files were imported.");
      },
      onError: (error: Error) => toast.error(error.message || "Could not import Dropbox creative files"),
    });
  };

  const submitApproval = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("A review delivery name is required");
      const isUntitledFolderDelivery = videoItems.length === 1
        && !videoItems[0].title.trim()
        && !videoItems[0].reviewUrl.trim();
      const itemsForSubmission = isUntitledFolderDelivery
        ? createDropboxImportedVideoItems((await importDropboxTitles.mutateAsync(reviewUrl)).items)
        : videoItems;
      if (!itemsForSubmission.length) throw new Error("No video filenames could be imported from that Dropbox folder");
      if (isUntitledFolderDelivery) setVideoItems(itemsForSubmission);
      const prepared = buildVideoReviewItems(reviewUrl, itemsForSubmission);
      const { error } = await supabase.rpc("create_video_review_request", {
        _project_id: projectId,
        _title: title.trim(),
        _description: description.trim(),
        _review_url: prepared.deliveryUrl,
        _phase: phase,
        _items: prepared.items,
      });
      if (error) throw error;
      return { itemCount: prepared.items.length, imported: isUntitledFolderDelivery };
    },
    onSuccess: (result) => {
      toast.success(result.imported
        ? `${result.itemCount} creative items imported and sent for client review`
        : result.itemCount === 1 ? "Creative item sent for client review" : `${result.itemCount} creative items sent for client review`);
      void queryClient.invalidateQueries({ queryKey: ["approvals", projectId] });
      closeForm();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Creative reviews</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Send videos, graphics, or a mixed Dropbox folder. Every named item receives its own client decision.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setFormOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Send delivery</Button>
      </div>

      {approvals.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">No completed creative items have been sent for review.</p> : (
        <div className="space-y-2">
          {approvals.map((approval) => {
            const cfg = STATUS_CONFIG[approval.status] || STATUS_CONFIG.pending;
            const Icon = cfg.icon;
            const items = [...(approval.approval_request_items ?? [])].sort((a, b) => a.position - b.position);
            return (
              <div key={approval.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Icon className={`h-4 w-4 ${cfg.color}`} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{approval.title}</p><Badge variant="outline" className={`h-4 px-1 text-[10px] ${cfg.color}`}>{approvalStatusLabel(approval.status)}</Badge></div>
                  {approval.description && <p className="mt-0.5 text-xs text-muted-foreground">{approval.description}</p>}
                  {approval.review_url ? <Button variant="link" size="sm" className="h-auto p-0 pt-1 text-xs" asChild><a href={approval.review_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" /> Open Dropbox source</a></Button> : <p className="pt-1 text-xs text-muted-foreground">No Dropbox source link was included.</p>}
                  {items.length > 0 && <div className="mt-2 space-y-1 rounded-md bg-muted/40 p-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{items.length} creative item{items.length === 1 ? "" : "s"} in this delivery</p>{items.map((item, itemIndex) => { const videoNumber = item.position > 0 ? item.position : itemIndex + 1; return <div key={item.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"><span>Item {videoNumber}: {item.title}</span><Badge variant="secondary" className="h-4 px-1 text-[9px]">{approvalStatusLabel(item.status)}</Badge><Badge variant={item.viewed_at ? "default" : "outline"} className={`h-4 gap-0.5 px-1 text-[9px] ${item.viewed_at ? "bg-sky-600 hover:bg-sky-600" : "text-muted-foreground"}`}>{item.viewed_at && <Eye className="h-2.5 w-2.5" />}{item.viewed_at ? `Viewed ${format(new Date(item.viewed_at), "MMM d")}` : "Not viewed"}</Badge>{item.response_note && <span className="italic text-muted-foreground">“{item.response_note}”</span>}</div>; })}</div>}
                  {approval.phase && <span className="mt-1 inline-block text-[10px] text-muted-foreground">Phase: {approval.phase}</span>}
                  <p className="mt-1 text-[10px] text-muted-foreground">Sent {format(new Date(approval.created_at), "MMM d, yyyy")}{approval.responded_at && ` · All items reviewed ${format(new Date(approval.responded_at), "MMM d")}`}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(open) => (open ? setFormOpen(true) : closeForm())}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="h-4 w-4" /> Send creative items for review</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="approval-title">Delivery name *</Label><Input id="approval-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. September campaign creative" maxLength={160} /></div>
              <div className="space-y-2"><Label>Project phase</Label><Select value={phase} onValueChange={setPhase}><SelectTrigger><SelectValue placeholder="Select phase (optional)" /></SelectTrigger><SelectContent>{["discovery", "design", "development", "review", "launch", "deploy"].map((item) => <SelectItem key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="space-y-2"><Label htmlFor="approval-review-url">Dropbox folder or creative-file link *</Label><div className="relative"><Video className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="approval-review-url" type="url" value={reviewUrl} onChange={(event) => setReviewUrl(event.target.value)} placeholder="https://www.dropbox.com/..." className="pl-9" /></div><p className="text-xs text-muted-foreground">For a folder, this securely delivers every video and graphic inside Vektiss. Individual direct links can be added below.</p></div>
            <VideoReviewItemFields idPrefix="workspace-video" items={videoItems} onChange={setVideoItems} onImportFromDropbox={importDropboxFolderTitles} importReady={Boolean(dropboxConnectionQuery.data?.connected)} importConnectionLoading={dropboxConnectionQuery.isLoading} importInProgress={importDropboxTitles.isPending} />
            <div className="space-y-2"><Label htmlFor="approval-description">Review notes</Label><Textarea id="approval-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What should the client review or decide?" rows={3} maxLength={2000} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={closeForm}>Cancel</Button><Button onClick={() => submitApproval.mutate()} disabled={submitApproval.isPending}>{submitApproval.isPending ? "Sending…" : "Send to client"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
