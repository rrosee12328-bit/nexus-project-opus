import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Pencil, RefreshCw, Save, X, Plus, Trash2, ExternalLink, Link2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type RecapLink = { label: string; url: string; kind?: string };

function detectKind(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("gamma.app")) return "gamma";
  if (u.includes("dropbox.com")) return "dropbox";
  if (u.includes("docs.google.com") || u.includes("drive.google.com")) return "google";
  if (u.includes("figma.com")) return "figma";
  if (u.includes("notion.so")) return "notion";
  if (u.includes("loom.com")) return "loom";
  return "link";
}

function kindStyles(kind?: string) {
  switch (kind) {
    case "gamma": return "bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/30";
    case "dropbox": return "bg-blue-500/10 text-blue-600 border-blue-500/30";
    case "google": return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
    case "figma": return "bg-violet-500/10 text-violet-600 border-violet-500/30";
    case "notion": return "bg-foreground/10 text-foreground border-foreground/20";
    case "loom": return "bg-orange-500/10 text-orange-600 border-orange-500/30";
    default: return "bg-muted text-foreground border-border";
  }
}

export function StatusRecapCard({ clientId }: { clientId: string }) {
  const [recap, setRecap] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [headline, setHeadline] = useState<string | null>(null);
  const [lastCallId, setLastCallId] = useState<string | null>(null);
  const [links, setLinks] = useState<RecapLink[]>([]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("clients")
      .select("current_status_recap, current_status_updated_at, current_status_links, last_call_headline, last_call_id")
      .eq("id", clientId)
      .maybeSingle();
    setRecap((data as any)?.current_status_recap ?? null);
    setUpdatedAt((data as any)?.current_status_updated_at ?? null);
    setHeadline((data as any)?.last_call_headline ?? null);
    setLastCallId((data as any)?.last_call_id ?? null);
    const raw = (data as any)?.current_status_links;
    setLinks(Array.isArray(raw) ? (raw as RecapLink[]) : []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`recap-${clientId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "clients", filter: `id=eq.${clientId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [clientId]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("clients")
      .update({
        current_status_recap: draft.trim() || null,
        current_status_updated_at: new Date().toISOString(),
      })
      .eq("id", clientId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setEditing(false);
    toast.success("Briefing updated");
    load();
  };

  const refreshFromCall = async () => {
    if (!lastCallId) {
      toast.error("No analyzed call yet for this client.");
      return;
    }
    setRefreshing(true);
    const { error } = await supabase.functions.invoke("analyze-call", { body: { call_id: lastCallId } });
    setRefreshing(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Briefing regenerated from latest call");
    load();
  };

  const addLink = async () => {
    const url = linkUrl.trim();
    if (!url) return;
    let normalized = url;
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    const next: RecapLink[] = [
      ...links,
      { label: linkLabel.trim() || normalized.replace(/^https?:\/\//, "").slice(0, 60), url: normalized, kind: detectKind(normalized) },
    ];
    const { error } = await supabase
      .from("clients")
      .update({ current_status_links: next as any })
      .eq("id", clientId);
    if (error) { toast.error(error.message); return; }
    setLinkLabel(""); setLinkUrl(""); setAddingLink(false);
    toast.success("Link attached");
    load();
  };

  const removeLink = async (idx: number) => {
    const next = links.filter((_, i) => i !== idx);
    const { error } = await supabase
      .from("clients")
      .update({ current_status_links: next as any })
      .eq("id", clientId);
    if (error) { toast.error(error.message); return; }
    load();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Latest Briefing
          </CardTitle>
          <div className="flex items-center gap-1">
            {!editing && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setAddingLink((v) => !v)} title="Attach a link">
                  <Link2 className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={refreshFromCall} disabled={refreshing || !lastCallId} title={lastCallId ? "Regenerate from latest call" : "No analyzed call available"}>
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setDraft(recap ?? ""); setEditing(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
        {updatedAt && (
          <p className="text-[11px] text-muted-foreground font-mono mt-1">
            As of {format(new Date(updatedAt), "MMM d, yyyy 'at' h:mm a")} · {formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              placeholder="3-5 sentences a new teammate could read and immediately understand where this client is at."
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                <Save className="h-3.5 w-3.5 mr-1" /> Save
              </Button>
            </div>
          </div>
        ) : recap ? (
          <>
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{recap}</p>
            {headline && (
              <p className="text-[11px] text-muted-foreground italic border-l-2 border-primary/40 pl-2">
                {headline}
              </p>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground">
            No briefing yet. {lastCallId
              ? "Click the refresh icon to generate one from the most recent call."
              : "Once a call is analyzed, a plain-English briefing will appear here automatically."}
          </div>
        )}

        {/* Attached links */}
        {(links.length > 0 || addingLink) && (
          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Link2 className="h-3 w-3" /> Reference materials
            </p>
            <div className="flex flex-wrap gap-2">
              {links.map((l, i) => (
                <div key={`${l.url}-${i}`} className="group inline-flex items-stretch rounded-md border overflow-hidden text-xs">
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className={`px-2 py-1 inline-flex items-center gap-1.5 hover:opacity-90 ${kindStyles(l.kind)}`}
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span className="truncate max-w-[220px]">{l.label}</span>
                    {l.kind && l.kind !== "link" && (
                      <Badge variant="outline" className="ml-1 h-4 px-1 text-[9px] capitalize bg-background/60">{l.kind}</Badge>
                    )}
                  </a>
                  <button
                    onClick={() => removeLink(i)}
                    className="px-1.5 border-l text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                    title="Remove link"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            {addingLink && (
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <Input placeholder="Label (optional)" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} className="sm:max-w-[200px] h-8 text-xs" />
                <Input placeholder="https://..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="flex-1 h-8 text-xs" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={addLink} disabled={!linkUrl.trim()} className="h-8">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAddingLink(false); setLinkLabel(""); setLinkUrl(""); }} className="h-8">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {!addingLink && links.length === 0 && (
          <Button variant="outline" size="sm" onClick={() => setAddingLink(true)} className="w-full">
            <Plus className="h-3.5 w-3.5 mr-1" /> Attach Gamma deck, Dropbox folder, or other reference
          </Button>
        )}
      </CardContent>
    </Card>
  );
}