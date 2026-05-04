import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardList, Pencil, RefreshCw, Save, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export function StatusRecapCard({ clientId }: { clientId: string }) {
  const [recap, setRecap] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [headline, setHeadline] = useState<string | null>(null);
  const [lastCallId, setLastCallId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("clients")
      .select("current_status_recap, current_status_updated_at, last_call_headline, last_call_id")
      .eq("id", clientId)
      .maybeSingle();
    setRecap((data as any)?.current_status_recap ?? null);
    setUpdatedAt((data as any)?.current_status_updated_at ?? null);
    setHeadline((data as any)?.last_call_headline ?? null);
    setLastCallId((data as any)?.last_call_id ?? null);
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
      .update({ current_status_recap: draft.trim() || null, current_status_updated_at: new Date().toISOString() })
      .eq("id", clientId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setEditing(false);
    toast.success("Status recap updated");
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
    toast.success("Recap regenerated from latest call");
    load();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Where We Stand
          </CardTitle>
          <div className="flex items-center gap-2">
            {!editing && (
              <>
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
      </CardHeader>
      <CardContent className="space-y-3">
        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
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
            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono pt-1">
              <span>{updatedAt ? `Updated ${formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}` : ""}</span>
              {headline && <span className="truncate max-w-[60%] text-right italic">"{headline}"</span>}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">
            No recap yet. {lastCallId
              ? "Click the refresh icon to generate one from the most recent call."
              : "Once a call is analyzed, a plain-English summary will appear here automatically."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}