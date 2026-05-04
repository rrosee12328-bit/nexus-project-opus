import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Goal = { id: string; content: string | null; created_at: string; meeting_date: string | null };

export function AspirationsCard({ clientId }: { clientId: string }) {
  const [aspirations, setAspirations] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [sentiment, setSentiment] = useState<string | null>(null);
  const [history, setHistory] = useState<Goal[]>([]);

  const load = async () => {
    const { data: c } = await supabase
      .from("clients")
      .select("aspirations, aspirations_updated_at, current_sentiment")
      .eq("id", clientId)
      .maybeSingle();
    setAspirations((c as any)?.aspirations ?? null);
    setUpdatedAt((c as any)?.aspirations_updated_at ?? null);
    setSentiment((c as any)?.current_sentiment ?? null);

    const { data: notes } = await supabase
      .from("client_notes")
      .select("id, content, created_at, meeting_date")
      .eq("client_id", clientId)
      .eq("type", "goals")
      .order("created_at", { ascending: false })
      .limit(5);
    setHistory((notes ?? []) as any);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`asp-${clientId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "clients", filter: `id=eq.${clientId}` }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "client_notes", filter: `client_id=eq.${clientId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId]);

  const sentimentColor =
    sentiment === "positive" ? "text-emerald-600 border-emerald-500/40"
    : sentiment === "negative" ? "text-destructive border-destructive/40"
    : sentiment === "mixed" ? "text-amber-600 border-amber-500/40"
    : "text-muted-foreground";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Aspirations & Sentiment
          </CardTitle>
          {sentiment && (
            <Badge variant="outline" className={`text-xs capitalize ${sentimentColor}`}>{sentiment}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {aspirations ? (
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-sm leading-relaxed">{aspirations}</p>
            {updatedAt && (
              <p className="text-[10px] text-muted-foreground mt-2 font-mono">
                Updated {formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No aspirations captured yet. They'll appear here automatically after a call is analyzed.
          </p>
        )}

        {history.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
              <History className="h-3 w-3" /> Goals timeline
            </p>
            <ol className="space-y-2">
              {history.map((g) => (
                <li key={g.id} className="text-xs border-l-2 border-primary/30 pl-3">
                  <p className="text-foreground/90">{g.content}</p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {formatDistanceToNow(new Date(g.created_at), { addSuffix: true })}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}