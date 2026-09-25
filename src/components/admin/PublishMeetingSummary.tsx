import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function PublishMeetingSummary({ callId, clientId, callDate }: { callId: string; clientId: string; callDate: string }) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const published = useQuery({ queryKey: ["published-meeting", callId], queryFn: async () => {
    const { data, error } = await supabase.from("client_meeting_summaries" as never).select("summary, approved_at").eq("id", callId).maybeSingle();
    if (error) throw error;
    return data as unknown as { summary: string; approved_at: string } | null;
  } });
  const summary = draft ?? published.data?.summary ?? "";
  const save = async () => {
    if (!user || !summary.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("client_meeting_summaries" as never).upsert({ id: callId, client_id: clientId, call_date: callDate, summary: summary.trim(), approved_by: user.id } as never);
    setSaving(false);
    if (error) { toast.error("Summary could not be published"); return; }
    toast.success("Summary is available in the client portal");
    void cache.invalidateQueries({ queryKey: ["published-meeting", callId] });
    void cache.invalidateQueries({ queryKey: ["client-calls", clientId] });
  };
  return <section className="space-y-3 rounded-xl border p-4"><Label htmlFor={`summary-${callId}`}>Client-approved meeting summary</Label><p className="text-xs text-muted-foreground">Write the update the client should see. Include their decisions and next steps. Keep internal discussions, technology details, and pricing calculations private.</p>{published.error ? <p role="alert" className="text-sm text-destructive">Publishing is unavailable until the workspace migration is installed.</p> : <><Textarea id={`summary-${callId}`} rows={6} value={summary} onChange={event => setDraft(event.target.value)} placeholder="We agreed on the next project milestone..." /><Button disabled={saving || published.isLoading || !summary.trim()} onClick={() => void save()}>{saving ? "Publishing..." : "Publish to client portal"}</Button>{published.data && <p className="text-xs text-muted-foreground">Last published {new Date(published.data.approved_at).toLocaleString()}</p>}</>}</section>;
}
