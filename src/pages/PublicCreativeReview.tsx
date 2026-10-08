import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Clock, Eye, FileCheck, ImageIcon, Lightbulb, List, Loader2, LogIn, Play, ShieldCheck, Video, XCircle } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { EmbeddedDropboxVideo } from "@/components/approvals/EmbeddedDropboxVideo";
import { getDropboxReviewAssetKind, reviewAssetLabel } from "@/lib/dropboxReviewAssets";
import { approvalResponseActionLabel, approvalResponseNeedsNote, approvalStatusLabel, type ClientApprovalResponse } from "@/lib/approvalStatus";

type PublicItem = {
  id: string;
  title: string;
  source_file_name: string | null;
  status: string;
  response_note: string | null;
  responded_at: string | null;
  viewed_at: string | null;
  position: number;
};
type PublicReview = {
  id: string;
  title: string;
  description: string | null;
  phase: string | null;
  status: string;
  created_at: string;
  project_name: string | null;
  expires_at: string;
  items: PublicItem[];
};
type ResponseChoice = ClientApprovalResponse | null;

const STATUS_CONFIG: Record<string, { color: string; icon: typeof Clock }> = {
  pending: { color: "text-amber-500", icon: Clock },
  approved: { color: "text-emerald-500", icon: CheckCircle2 },
  rejected: { color: "text-destructive", icon: XCircle },
  suggestions: { color: "text-violet-500", icon: Lightbulb },
};

export default function PublicCreativeReview() {
  const { token } = useParams<{ token: string }>();
  const [review, setReview] = useState<PublicReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"preview" | "items">("preview");
  const [openedItemIds, setOpenedItemIds] = useState<Set<string>>(() => new Set());
  const [responding, setResponding] = useState(false);
  const [responseChoice, setResponseChoice] = useState<ResponseChoice>(null);
  const [responseNote, setResponseNote] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const { data, error: loadError } = await supabase.functions.invoke<{ review?: PublicReview; error?: string }>("get-public-creative-review", { body: { token } });
    if (loadError || !data?.review) {
      setError(data?.error || loadError?.message || "This private review link is invalid or has expired.");
      setLoading(false);
      return;
    }
    const sorted = [...data.review.items].sort((a, b) => a.position - b.position);
    setReview({ ...data.review, items: sorted });
    setSelectedItemId((current) => current && sorted.some((item) => item.id === current) ? current : sorted[0]?.id ?? null);
    setLoading(false);
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const activeItem = useMemo(() => review?.items.find((item) => item.id === selectedItemId) ?? review?.items[0] ?? null, [review, selectedItemId]);
  const viewedCount = review?.items.filter((item) => item.viewed_at || openedItemIds.has(item.id)).length ?? 0;
  const decidedCount = review?.items.filter((item) => item.status !== "pending").length ?? 0;

  const markViewed = async (itemId: string) => {
    if (!token || openedItemIds.has(itemId) || review?.items.find((item) => item.id === itemId)?.viewed_at) return;
    setOpenedItemIds((current) => new Set(current).add(itemId));
    const { error: viewError } = await supabase.functions.invoke("submit-public-creative-review", { body: { token, itemId, action: "view" } });
    if (viewError) return;
    setReview((current) => current ? { ...current, items: current.items.map((item) => item.id === itemId ? { ...item, viewed_at: new Date().toISOString() } : item) } : current);
  };

  const submitResponse = async (status: ClientApprovalResponse) => {
    if (!token || !activeItem) return;
    if (approvalResponseNeedsNote(status) && !responseNote.trim()) return;
    setActionError(null);
    setResponding(true);
    const { data, error: submitError } = await supabase.functions.invoke<{ error?: string }>("submit-public-creative-review", { body: { token, itemId: activeItem.id, action: "respond", status, responseNote } });
    setResponding(false);
    if (submitError || data?.error) {
      setActionError(data?.error || submitError?.message || "Could not save your response.");
      return;
    }
    setReview((current) => current ? { ...current, items: current.items.map((item) => item.id === activeItem.id ? { ...item, status, response_note: responseNote.trim() || null, responded_at: new Date().toISOString() } : item) } : current);
    setResponseChoice(null);
    setResponseNote("");
    setActionError(null);
  };

  if (loading) return <div className="min-h-screen bg-background p-6"><div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin text-primary" /> Opening secure creative review…</div></div>;
  if (error || !review) return <div className="min-h-screen bg-background p-6"><Card className="mx-auto mt-[15vh] max-w-md"><CardContent className="space-y-3 p-7 text-center"><XCircle className="mx-auto h-10 w-10 text-destructive" /><h1 className="text-xl font-semibold">Creative review unavailable</h1><p className="text-sm text-muted-foreground">{error || "This link is invalid or expired."}</p><Button asChild variant="outline"><a href="/login"><LogIn className="mr-2 h-4 w-4" /> Sign in to Vektiss</a></Button></CardContent></Card></div>;

  return <div className="min-h-screen bg-background"><header className="border-b border-border bg-card/80 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Vektiss · private client delivery</p><h1 className="mt-1 text-lg font-semibold sm:text-xl">Creative review</h1></div><Button asChild variant="outline" size="sm"><a href="/login"><LogIn className="mr-1.5 h-3.5 w-3.5" /> Sign in</a></Button></div></header><main className="mx-auto max-w-6xl space-y-5 px-3 py-5 sm:px-6 sm:py-8"><Card className="border-primary/25"><CardContent className="space-y-4 p-4 sm:p-6"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10"><ShieldCheck className="h-5 w-5 text-primary" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{review.title}</h2><Badge variant="outline" className="text-[10px]">Private review link</Badge></div>{review.project_name && <p className="text-xs text-muted-foreground">Project: {review.project_name}</p>}{review.description && <p className="mt-1 text-sm text-muted-foreground">{review.description}</p>}<div className="mt-3 flex flex-wrap gap-2 text-xs"><Badge variant="secondary" className="gap-1"><List className="h-3 w-3" /> {review.items.length} items</Badge><Badge variant="outline">{viewedCount} viewed</Badge><Badge variant="outline">{decidedCount} decided</Badge></div></div></div><p className="text-[11px] text-muted-foreground">This link is only for this delivery and expires {format(new Date(review.expires_at), "MMMM d, yyyy")}. Sign in to Vektiss to access the rest of your workspace.</p></CardContent></Card>{review.items.length === 0 ? <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No reviewable creative items are included in this delivery.</CardContent></Card> : <><div className="grid grid-cols-2 rounded-lg border border-border bg-muted/30 p-1 lg:hidden" role="tablist" aria-label="Review layout"><button type="button" role="tab" aria-selected={mobileView === "preview"} onClick={() => setMobileView("preview")} className={`flex min-h-10 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium ${mobileView === "preview" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}><Play className="h-3.5 w-3.5" /> Preview</button><button type="button" role="tab" aria-selected={mobileView === "items"} onClick={() => setMobileView("items")} className={`flex min-h-10 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium ${mobileView === "items" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}><List className="h-3.5 w-3.5" /> Items ({review.items.length})</button></div><div className="grid gap-4 lg:grid-cols-[minmax(14rem,0.7fr)_minmax(0,1.5fr)]"><aside className={`max-h-[34rem] space-y-1.5 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2 ${mobileView === "items" ? "block" : "hidden"} lg:block`}><p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Creative items</p>{review.items.map((item, index) => { const kind = getDropboxReviewAssetKind(item.source_file_name ?? item.title); const MediaIcon = kind === "graphic" ? ImageIcon : Video; const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending; const ItemIcon = cfg.icon; const selected = item.id === activeItem?.id; const viewed = Boolean(item.viewed_at) || openedItemIds.has(item.id); return <button key={item.id} type="button" onClick={() => { setSelectedItemId(item.id); setMobileView("preview"); setResponseChoice(null); setResponseNote(""); setActionError(null); }} className={`w-full rounded-lg border p-2 text-left transition-colors ${selected ? "border-primary/50 bg-primary/10" : "border-transparent hover:border-border hover:bg-background/70"}`}><div className="flex items-center gap-2"><MediaIcon className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={`${item.position || index + 1}. ${item.title}`}>{item.position || index + 1}. {item.title}</p><div className="mt-1 flex flex-wrap gap-1"><Badge variant="secondary" className="h-4 px-1 text-[8px]">{reviewAssetLabel(kind)}</Badge><Badge variant="secondary" className="h-4 px-1 text-[8px]"><ItemIcon className={`mr-0.5 h-2.5 w-2.5 ${cfg.color}`} />{approvalStatusLabel(item.status)}</Badge><Badge variant={viewed ? "default" : "outline"} className={`h-4 gap-0.5 px-1 text-[8px] ${viewed ? "bg-sky-600 hover:bg-sky-600" : "text-muted-foreground"}`}>{viewed && <Eye className="h-2.5 w-2.5" />}{viewed ? "Viewed" : "Not viewed"}</Badge></div></div></div></button>; })}</aside>{activeItem && <section className={`min-w-0 ${mobileView === "preview" ? "block" : "hidden"} lg:block`}><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Now reviewing</p><h2 className="mt-0.5 text-base font-semibold">{activeItem.title}</h2></div><Badge variant="outline" className="text-[10px]">{reviewAssetLabel(getDropboxReviewAssetKind(activeItem.source_file_name ?? activeItem.title))} {activeItem.position || review.items.indexOf(activeItem) + 1} of {review.items.length}</Badge></div><EmbeddedDropboxVideo itemId={activeItem.id} title={activeItem.title} sourceFileName={activeItem.source_file_name} publicToken={token} onPlaybackStarted={() => void markViewed(activeItem.id)} />{actionError && <p role="alert" className="mt-2 text-xs text-destructive">{actionError}</p>}{activeItem.viewed_at && <p className="mt-2 text-[10px] text-muted-foreground">Viewed {format(new Date(activeItem.viewed_at), "MMM d, yyyy · h:mm a")}</p>}{activeItem.status === "pending" ? <div className="mt-4 space-y-3 border-t border-border pt-4">{responseChoice ? <><div className="space-y-2"><label className="text-sm font-medium" htmlFor="public-review-feedback">{approvalResponseNeedsNote(responseChoice) ? "Your feedback *" : "Optional note"}</label><Textarea id="public-review-feedback" value={responseNote} onChange={(event) => setResponseNote(event.target.value)} placeholder={responseChoice === "rejected" ? "Tell us what needs to change…" : responseChoice === "suggestions" ? "Share your ideas or specific edits…" : "Add a note for the Vektiss team…"} rows={3} maxLength={3000} /></div><div className="flex flex-wrap gap-2"><Button size="sm" variant={responseChoice === "rejected" ? "destructive" : "default"} onClick={() => void submitResponse(responseChoice)} disabled={responding || (approvalResponseNeedsNote(responseChoice) && !responseNote.trim())}>{responding ? "Sending…" : approvalResponseActionLabel(responseChoice)}</Button><Button size="sm" variant="ghost" onClick={() => setResponseChoice(null)} disabled={responding}>Back</Button></div></> : <div className="flex flex-wrap gap-2"><Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => void submitResponse("approved")} disabled={responding}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve {reviewAssetLabel(getDropboxReviewAssetKind(activeItem.source_file_name ?? activeItem.title)).toLocaleLowerCase()}</Button><Button size="sm" variant="destructive" onClick={() => setResponseChoice("rejected")} disabled={responding}><XCircle className="mr-1 h-3.5 w-3.5" /> Request changes</Button><Button size="sm" variant="outline" onClick={() => setResponseChoice("suggestions")} disabled={responding}><Lightbulb className="mr-1 h-3.5 w-3.5" /> Send suggestions</Button></div>}</div> : <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm"><p className="flex items-center gap-1.5 font-medium"><FileCheck className={`h-4 w-4 ${(STATUS_CONFIG[activeItem.status] ?? STATUS_CONFIG.pending).color}`} /> {approvalStatusLabel(activeItem.status)}</p>{activeItem.response_note && <p className="mt-1 text-xs text-muted-foreground">“{activeItem.response_note}”</p>}</div>}</section>}</div></>}</main></div>;
}
