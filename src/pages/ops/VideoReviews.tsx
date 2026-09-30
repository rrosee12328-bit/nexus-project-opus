import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, Clock, ExternalLink, Lightbulb, Send, Video, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { approvalStatusLabel } from "@/lib/approvalStatus";
import { normalizeDropboxReviewUrl } from "@/lib/reviewUrl";
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

const STATUS_CONFIG: Record<string, { color: string; icon: typeof Clock }> = {
  pending: { color: "text-amber-500", icon: Clock },
  approved: { color: "text-emerald-500", icon: CheckCircle2 },
  rejected: { color: "text-destructive", icon: XCircle },
  suggestions: { color: "text-violet-500", icon: Lightbulb },
};

export default function VideoReviews() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reviewUrl, setReviewUrl] = useState("");

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["team-video-review-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, client_id, current_phase, clients(name)")
        .not("client_id", "is", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as ReviewProject[];
    },
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["team-video-reviews"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approval_requests")
        .select("*, clients(name), projects(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedProject = useMemo(() => projects.find((project) => project.id === projectId) ?? null, [projectId, projects]);

  const submitReview = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("You must be signed in to send a video for review");
      if (!selectedProject) throw new Error("Choose the client project for this video");
      if (!title.trim()) throw new Error("A video title is required");
      const normalizedReviewUrl = normalizeDropboxReviewUrl(reviewUrl);
      if (!normalizedReviewUrl) throw new Error("Enter a secure Dropbox shared-video link");

      const { error } = await supabase.from("approval_requests").insert({
        project_id: selectedProject.id,
        client_id: selectedProject.client_id,
        title: title.trim(),
        description: description.trim() || null,
        review_url: normalizedReviewUrl,
        phase: selectedProject.current_phase || null,
        submitted_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dropbox video sent to the client for review");
      setProjectId("");
      setTitle("");
      setDescription("");
      setReviewUrl("");
      void queryClient.invalidateQueries({ queryKey: ["team-video-reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["team-video-review-projects"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="kicker mb-2">Client delivery</p>
        <h1 className="text-2xl font-bold tracking-tight">Video reviews</h1>
        <p className="mt-1 text-sm text-muted-foreground">Share a completed Dropbox video with the right client and collect an approval, decline, or suggestions in the portal.</p>
      </div>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Video className="h-5 w-5 text-primary" /> Send a completed video</CardTitle>
          <CardDescription>The client gets a portal notification and can respond after watching the Dropbox video.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="review-project">Client project *</Label>
              <Select value={projectId} onValueChange={setProjectId} disabled={projectsLoading}>
                <SelectTrigger id="review-project"><SelectValue placeholder={projectsLoading ? "Loading projects…" : "Choose a project"} /></SelectTrigger>
                <SelectContent>
                  {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.clients?.name ?? "Client"} — {project.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {selectedProject?.current_phase && <p className="text-xs text-muted-foreground">This will be tagged to the {selectedProject.current_phase} phase.</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-title">Video title *</Label>
              <Input id="review-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. September social campaign — cut 1" maxLength={160} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="review-link">Completed-video Dropbox link *</Label>
            <Input id="review-link" type="url" value={reviewUrl} onChange={(event) => setReviewUrl(event.target.value)} placeholder="https://www.dropbox.com/..." />
            <p className="text-xs text-muted-foreground">Only secure Dropbox share links are accepted. Links open in the Dropbox viewer so the client can watch before responding.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="review-notes">Review notes</Label>
            <Textarea id="review-notes" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What should the client review or decide?" rows={3} maxLength={2000} />
          </div>
          <Button onClick={() => submitReview.mutate()} disabled={submitReview.isPending || projectsLoading}><Send className="mr-2 h-4 w-4" />{submitReview.isPending ? "Sending…" : "Send for client review"}</Button>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Recent video reviews</h2><span className="text-xs text-muted-foreground">Latest 50</span></div>
        {reviews.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No completed videos have been sent for review yet.</CardContent></Card> : (
          <div className="space-y-2">
            {reviews.map((review) => {
              const cfg = STATUS_CONFIG[review.status] || STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              return <Card key={review.id}><CardContent className="flex items-start gap-3 py-4"><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Icon className={`h-4 w-4 ${cfg.color}`} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{review.title}</p><Badge variant="outline" className={`text-[10px] ${cfg.color}`}>{approvalStatusLabel(review.status)}</Badge></div><p className="mt-0.5 text-xs text-muted-foreground">{review.clients?.name ?? "Client"} · {review.projects?.name ?? "Project"} · Sent {format(new Date(review.created_at), "MMM d, yyyy")}</p>{review.description && <p className="mt-1 text-sm text-muted-foreground">{review.description}</p>}{review.review_url ? <a href={review.review_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" /> Open Dropbox video</a> : <p className="mt-2 text-xs text-muted-foreground">No video link was included.</p>}{review.response_note && <p className="mt-2 rounded-md bg-muted px-2.5 py-2 text-xs italic text-muted-foreground">Client response: “{review.response_note}”</p>}</div></CardContent></Card>;
            })}
          </div>
        )}
      </section>
    </div>
  );
}
