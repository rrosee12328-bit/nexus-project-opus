import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Clock, Eye, FileCheck, Lightbulb, ListVideo, Play, Video, XCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { approvalResponseActionLabel, approvalResponseNeedsNote, approvalStatusLabel, type ClientApprovalResponse } from "@/lib/approvalStatus";
import { EmbeddedDropboxVideo } from "@/components/approvals/EmbeddedDropboxVideo";

type ApprovalItem = Database["public"]["Tables"]["approval_request_items"]["Row"];
type ClientApproval = Database["public"]["Tables"]["approval_requests"]["Row"] & {
  projects: { name: string } | null;
  approval_request_items: ApprovalItem[] | null;
};
type ResponseTarget = { kind: "request" | "item"; id: string };

const STATUS_CONFIG: Record<string, { color: string; icon: typeof Clock }> = {
  pending: { color: "text-amber-500", icon: Clock },
  approved: { color: "text-emerald-500", icon: CheckCircle2 },
  rejected: { color: "text-destructive", icon: XCircle },
  suggestions: { color: "text-violet-500", icon: Lightbulb },
};

function deliveryStatus(approval: ClientApproval): string {
  const items = approval.approval_request_items ?? [];
  if (items.length === 0) return approval.status;
  if (items.some((item) => item.status === "pending")) return "pending";
  if (items.some((item) => item.status === "rejected")) return "rejected";
  if (items.some((item) => item.status === "suggestions")) return "suggestions";
  return "approved";
}

export function ClientApprovals() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [responseTarget, setResponseTarget] = useState<ResponseTarget | null>(null);
  const [responseNote, setResponseNote] = useState("");
  const [selectedResponse, setSelectedResponse] = useState<ClientApprovalResponse | null>(null);
  const [openedItemIds, setOpenedItemIds] = useState<Set<string>>(() => new Set());
  const [selectedVideoIds, setSelectedVideoIds] = useState<Record<string, string>>({});

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ["client-approvals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approval_requests")
        .select("*, projects(name), approval_request_items(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ClientApproval[];
    },
    enabled: !!user?.id,
  });

  const closeResponse = () => {
    setResponseTarget(null);
    setResponseNote("");
    setSelectedResponse(null);
  };

  const beginResponse = (target: ResponseTarget) => {
    setResponseTarget(target);
    setResponseNote("");
    setSelectedResponse(null);
  };

  const markViewed = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("approval_request_items")
        .update({ viewed_at: new Date().toISOString() })
        .eq("id", itemId)
        .is("viewed_at", null);
      if (error) throw error;
    },
    onMutate: (itemId) => {
      setOpenedItemIds((current) => new Set(current).add(itemId));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["client-approvals"] });
    },
    onError: (error: Error, itemId) => {
      setOpenedItemIds((current) => {
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
      toast.error(error.message || "Could not save that this video was viewed");
    },
  });

  const respond = useMutation({
    mutationFn: async ({ target, status }: { target: ResponseTarget; status: ClientApprovalResponse }) => {
      if (approvalResponseNeedsNote(status) && !responseNote.trim()) {
        throw new Error(status === "suggestions" ? "Add your suggestions before sending" : "Tell the team what needs to change");
      }
      const values = { status, responded_at: new Date().toISOString(), response_note: responseNote.trim() || null };
      const request = target.kind === "item"
        ? supabase.from("approval_request_items").update(values).eq("id", target.id)
        : supabase.from("approval_requests").update(values).eq("id", target.id);
      const { error } = await request;
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success(status === "approved" ? "Video approved" : status === "suggestions" ? "Suggestions sent to the team" : "Changes requested");
      void queryClient.invalidateQueries({ queryKey: ["client-approvals"] });
      void queryClient.invalidateQueries({ queryKey: ["pending-approval-count"] });
      closeResponse();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to submit your response"),
  });

  const isActive = (target: ResponseTarget) => responseTarget?.kind === target.kind && responseTarget.id === target.id;

  const responseControls = (target: ResponseTarget) => {
    if (!isActive(target)) {
      return <Button size="sm" className="mt-4" onClick={() => beginResponse(target)}><FileCheck className="mr-1 h-3.5 w-3.5" /> Review & respond</Button>;
    }
    const requiresNote = selectedResponse ? approvalResponseNeedsNote(selectedResponse) : false;
    const inputId = `feedback-${target.kind}-${target.id}`;
    return (
      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={inputId}>{requiresNote ? "Your feedback *" : "Optional note"}</label>
          <Textarea id={inputId} value={responseNote} onChange={(event) => setResponseNote(event.target.value)} placeholder={selectedResponse === "rejected" ? "Tell us what needs to change…" : selectedResponse === "suggestions" ? "Share your ideas or specific edits…" : "Add a note for your team…"} rows={3} maxLength={3000} />
        </div>
        {selectedResponse ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={selectedResponse === "rejected" ? "destructive" : "default"} onClick={() => respond.mutate({ target, status: selectedResponse })} disabled={respond.isPending}>{respond.isPending ? "Sending…" : approvalResponseActionLabel(selectedResponse)}</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedResponse(null)} disabled={respond.isPending}>Back</Button>
            <Button size="sm" variant="ghost" onClick={closeResponse} disabled={respond.isPending}>Cancel</Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => respond.mutate({ target, status: "approved" })} disabled={respond.isPending}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve video</Button>
            <Button size="sm" variant="destructive" onClick={() => setSelectedResponse("rejected")} disabled={respond.isPending}><XCircle className="mr-1 h-3.5 w-3.5" /> Decline / request changes</Button>
            <Button size="sm" variant="outline" onClick={() => setSelectedResponse("suggestions")} disabled={respond.isPending}><Lightbulb className="mr-1 h-3.5 w-3.5" /> Send suggestions</Button>
            <Button size="sm" variant="ghost" onClick={closeResponse} disabled={respond.isPending}>Cancel</Button>
          </div>
        )}
      </div>
    );
  };

  const renderApproval = (approval: ClientApproval, index: number) => {
    const status = deliveryStatus(approval);
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    const Icon = cfg.icon;
    const items = [...(approval.approval_request_items ?? [])].sort((a, b) => a.position - b.position);
    const isGrouped = items.length > 0;
    const activeItem = isGrouped
      ? items.find((item) => item.id === selectedVideoIds[approval.id]) ?? items[0]
      : null;
    const reviewedCount = items.filter((item) => item.status !== "pending").length;
    const viewedCount = items.filter((item) => Boolean(item.viewed_at) || openedItemIds.has(item.id)).length;

    return (
      <motion.div key={approval.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * index }}>
        <Card className={status === "pending" ? "border-primary/35 shadow-[0_0_30px_rgba(37,99,235,0.08)]" : "opacity-85"}>
          <CardContent className="space-y-4 pb-5 pt-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Icon className={`h-5 w-5 ${cfg.color}`} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{approval.title}</p><Badge variant="outline" className={`text-[10px] ${cfg.color}`}>{approvalStatusLabel(status)}</Badge></div>
                {approval.projects?.name && <p className="text-xs text-muted-foreground">Project: {approval.projects.name}</p>}
                {approval.description && <p className="mt-1 text-sm text-muted-foreground">{approval.description}</p>}
                {isGrouped && <div className="mt-3 flex flex-wrap gap-2 text-xs"><Badge variant="secondary" className="gap-1"><ListVideo className="h-3 w-3" /> {items.length} video{items.length === 1 ? "" : "s"}</Badge><Badge variant="outline">{viewedCount} viewed</Badge><Badge variant="outline">{reviewedCount} decided</Badge></div>}
                {approval.phase && <Badge variant="outline" className="mt-3 text-[10px]">{approval.phase}</Badge>}
                <p className="mt-2 text-[10px] text-muted-foreground">Sent {format(new Date(approval.created_at), "MMMM d, yyyy")}</p>
              </div>
            </div>

            {activeItem ? (
              <div className="grid gap-4 border-t border-border pt-4 lg:grid-cols-[minmax(13rem,0.72fr)_minmax(0,1.5fr)]">
                <div className="max-h-[28rem] space-y-1.5 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2" aria-label="Video playlist">
                  <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Video playlist</p>
                  {items.map((item, itemIndex) => {
                    const itemCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
                    const ItemIcon = itemCfg.icon;
                    const viewed = Boolean(item.viewed_at) || openedItemIds.has(item.id);
                    const videoNumber = item.position > 0 ? item.position : itemIndex + 1;
                    const selected = item.id === activeItem.id;
                    return <button key={item.id} type="button" onClick={() => setSelectedVideoIds((current) => ({ ...current, [approval.id]: item.id }))} className={`w-full rounded-lg border p-2.5 text-left transition-colors ${selected ? "border-primary/50 bg-primary/10 shadow-sm" : "border-transparent hover:border-border hover:bg-background/70"}`} aria-pressed={selected}>
                      <div className="flex items-start gap-2"><ItemIcon className={`mt-0.5 h-4 w-4 shrink-0 ${itemCfg.color}`} /><div className="min-w-0 flex-1"><p className="line-clamp-2 text-xs font-medium">{videoNumber}. {item.title}</p><div className="mt-1.5 flex flex-wrap gap-1"><Badge variant="secondary" className="h-4 px-1 text-[8px]">{approvalStatusLabel(item.status)}</Badge><Badge variant={viewed ? "default" : "outline"} className={`h-4 gap-0.5 px-1 text-[8px] ${viewed ? "bg-sky-600 hover:bg-sky-600" : "text-muted-foreground"}`}>{viewed && <Eye className="h-2.5 w-2.5" />}{viewed ? "Viewed" : "Not viewed"}</Badge></div></div></div>
                    </button>;
                  })}
                </div>

                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Now reviewing</p><p className="mt-0.5 text-sm font-semibold">{activeItem.title}</p></div><Badge variant="outline" className="text-[10px]">Video {activeItem.position || items.indexOf(activeItem) + 1} of {items.length}</Badge></div>
                  <EmbeddedDropboxVideo itemId={activeItem.id} title={activeItem.title} onPlaybackStarted={() => {
                    const viewed = Boolean(activeItem.viewed_at) || openedItemIds.has(activeItem.id);
                    if (!viewed && !markViewed.isPending) markViewed.mutate(activeItem.id);
                  }} />
                  {activeItem.viewed_at && <p className="mt-2 text-[10px] text-muted-foreground">Viewed {format(new Date(activeItem.viewed_at), "MMM d, yyyy · h:mm a")}</p>}
                  {activeItem.response_note && <p className="mt-3 text-xs italic text-muted-foreground">“{activeItem.response_note}”</p>}
                  {activeItem.status === "pending" ? responseControls({ kind: "item", id: activeItem.id }) : <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className={`h-3.5 w-3.5 ${(STATUS_CONFIG[activeItem.status] || STATUS_CONFIG.pending).color}`} /> Decision recorded: {approvalStatusLabel(activeItem.status)}</p>}
                </div>
              </div>
            ) : (
              <div className="border-t border-border pt-4">{status === "pending" ? responseControls({ kind: "request", id: approval.id }) : <>{approval.response_note && <p className="text-xs italic text-muted-foreground">“{approval.response_note}”</p>}{approval.responded_at && <p className="mt-1 text-[10px] text-muted-foreground">Responded {format(new Date(approval.responded_at), "MMMM d, yyyy")}</p>}</>}</div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  const pending = approvals.filter((approval) => deliveryStatus(approval) === "pending");
  const resolved = approvals.filter((approval) => deliveryStatus(approval) !== "pending");

  return <div className="space-y-6"><motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}><h1 className="text-2xl font-bold tracking-tight">Video reviews</h1><p className="text-sm text-muted-foreground">Watch each Dropbox video here in Vektiss, then approve it, request changes, or send suggestions.</p></motion.div>{pending.length > 0 && <div className="space-y-3"><h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Needs your review ({pending.length})</h2>{pending.map(renderApproval)}</div>}{resolved.length > 0 && <div className="space-y-3"><h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Previous decisions ({resolved.length})</h2>{resolved.map(renderApproval)}</div>}{approvals.length === 0 && !isLoading && <Card><CardContent className="flex flex-col items-center justify-center gap-3 py-16"><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"><Video className="h-8 w-8 text-primary/40" /></div><p className="text-sm text-muted-foreground">No videos are waiting for your review.</p></CardContent></Card>}</div>;
}
