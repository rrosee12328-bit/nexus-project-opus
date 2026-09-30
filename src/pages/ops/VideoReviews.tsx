import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, Clock, ExternalLink, Lightbulb, Send, Video, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { approvalStatusLabel } from "@/lib/approvalStatus";
import { buildVideoReviewItems, createVideoReviewDraftItem, type VideoReviewDraftItem } from "@/lib/videoReviewItems";
import { VideoReviewItemFields } from "@/components/approvals/VideoReviewItemFields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ReviewProject = {
  id: string;
  name: string;
  client_id: string;
  current_phase: string | null;
  clients: { name: string } | null;
};
type ApprovalItem = Database["public"]["Tables"]["approval_request_items"]["Row"];
type TeamReview = Database["public"]["Tables"]["approval_requests"]["Row"] & {
  clients: { name: string } | null;
  projects: { name: string } | null;
  approval_request_items: ApprovalItem[] | null;
};

const STATUS_CONFIG: Record<string, { color: string; icon: typeof Clock }> = {
  pending: { color: "text-amber-500", icon: Clock },
  approved: { color: "text-emerald-500", icon: CheckCircle2 },
  rejected: { color: "text-destructive", icon: XCircle },
  suggestions: { color: "text-violet-500", icon: Lightbulb },
};

export default function VideoReviews() {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reviewUrl, setReviewUrl] = useState("");
  const [videoItems, setVideoItems] = useState<VideoReviewDraftItem[]>([createVideoReviewDraftItem()]);

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["team-video-review-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, name, client_id, current_phase, clients(name)").not("client_id", "is", null).order("name");
      if (error) throw error;
      return (data ?? []) as unknown as ReviewProject[];
    },
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["team-video-reviews"],
    queryFn: async () => {
      const { data, error } = await supabase.from("approval_requests").select("*, clients(name), projects(name), approval_request_items(*)").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as TeamReview[];
    },
  });

  const selectedProject = useMemo(() => projects.find((project) => project.id === projectId) ?? null, [projectId, projects]);

  const resetForm = () => {
    setProjectId("");
    setTitle("");
    setDescription("");
    setReviewUrl("");
    setVideoItems([createVideoReviewDraftItem()]);
  };

  const submitReview = useMutation({
    mutationFn: async () => {
      if (!selectedProject) throw new Error("Choose the client project for this delivery");
      if (!title.trim()) throw new Error("A review delivery name is required");
      const prepared = buildVideoReviewItems(reviewUrl, videoItems);
      const { error } = await supabase.rpc("create_video_review_request", {
        _project_id: selectedProject.id,
        _title: title.trim(),
        _description: description.trim(),
        _review_url: prepared.deliveryUrl,
        _phase: selectedProject.current_phase || "",
        _items: prepared.items,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(videoItems.length === 1 ? "Video sent to the client for review" : `${videoItems.length} videos sent to the client for review`);
      resetForm();
      void queryClient.invalidateQueries({ queryKey: ["team-video-reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["team-video-review-projects"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div><p className="kicker mb-2">Client delivery</p><h1 className="text-2xl font-bold tracking-tight">Video reviews</h1><p className="mt-1 text-sm text-muted-foreground">Share a single video or a Dropbox folder, then track the client’s decision for every named video.</p></div>

      <Card className="border-primary/20">
        <CardHeader><CardTitle className="flex items-center gap-2"><Video className="h-5 w-5 text-primary" /> Send videos for review</CardTitle><CardDescription>The client receives one portal notification and can approve, decline, or send suggestions for each video.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="review-project">Client project *</Label><Select value={projectId} onValueChange={setProjectId} disabled={projectsLoading}><SelectTrigger id="review-project"><SelectValue placeholder={projectsLoading ? "Loading projects…" : "Choose a project"} /></SelectTrigger><SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.clients?.name ?? "Client"} — {project.name}</SelectItem>)}</SelectContent></Select>{selectedProject?.current_phase && <p className="text-xs text-muted-foreground">This will be tagged to the {selectedProject.current_phase} phase.</p>}</div>
            <div className="space-y-2"><Label htmlFor="review-title">Delivery name *</Label><Input id="review-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. September campaign videos" maxLength={160} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="review-link">Dropbox folder or video link *</Label><Input id="review-link" type="url" value={reviewUrl} onChange={(event) => setReviewUrl(event.target.value)} placeholder="https://www.dropbox.com/..." /><p className="text-xs text-muted-foreground">This is the folder link for grouped deliveries. Each video below can optionally have a direct Dropbox link.</p></div>
          <VideoReviewItemFields idPrefix="ops-video" items={videoItems} onChange={setVideoItems} />
          <div className="space-y-2"><Label htmlFor="review-notes">Review notes</Label><Textarea id="review-notes" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What should the client review or decide?" rows={3} maxLength={2000} /></div>
          <Button onClick={() => submitReview.mutate()} disabled={submitReview.isPending || projectsLoading}><Send className="mr-2 h-4 w-4" />{submitReview.isPending ? "Sending…" : "Send for client review"}</Button>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Recent video reviews</h2><span className="text-xs text-muted-foreground">Latest 50</span></div>
        {reviews.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No completed videos have been sent for review yet.</CardContent></Card> : <div className="space-y-2">{reviews.map((review) => {
          const cfg = STATUS_CONFIG[review.status] || STATUS_CONFIG.pending;
          const Icon = cfg.icon;
          const items = [...(review.approval_request_items ?? [])].sort((a, b) => a.position - b.position);
          return <Card key={review.id}><CardContent className="flex items-start gap-3 py-4"><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Icon className={`h-4 w-4 ${cfg.color}`} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{review.title}</p><Badge variant="outline" className={`text-[10px] ${cfg.color}`}>{approvalStatusLabel(review.status)}</Badge></div><p className="mt-0.5 text-xs text-muted-foreground">{review.clients?.name ?? "Client"} · {review.projects?.name ?? "Project"} · Sent {format(new Date(review.created_at), "MMM d, yyyy")}</p>{review.description && <p className="mt-1 text-sm text-muted-foreground">{review.description}</p>}{review.review_url ? <a href={review.review_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" /> {items.length > 1 ? "Open Dropbox folder" : "Open Dropbox video"}</a> : <p className="mt-2 text-xs text-muted-foreground">No video link was included.</p>}{items.length > 0 && <div className="mt-3 space-y-1 rounded-md bg-muted/40 p-2.5"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Individual video outcomes</p>{items.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"><span>{item.title}</span><Badge variant="secondary" className="h-4 px-1 text-[9px]">{approvalStatusLabel(item.status)}</Badge>{item.response_note && <span className="italic text-muted-foreground">“{item.response_note}”</span>}</div>)}</div>}{review.response_note && <p className="mt-2 rounded-md bg-muted px-2.5 py-2 text-xs italic text-muted-foreground">{review.response_note}</p>}</div></CardContent></Card>;
        })}</div>}
      </section>
    </div>
  );
}
