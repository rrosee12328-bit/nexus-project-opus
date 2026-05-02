import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Snapshot {
  id: string;
  snapshot_date: string;
  summary_md: string;
  metrics: any;
  created_at: string;
}

function renderMarkdown(md: string) {
  // Lightweight markdown -> JSX (headings, bullets, bold)
  const lines = md.split("\n");
  const out: JSX.Element[] = [];
  let listBuf: string[] = [];
  const flushList = (key: number) => {
    if (listBuf.length === 0) return;
    out.push(
      <ul key={`ul-${key}`} className="list-disc pl-5 space-y-1 my-2 text-sm text-foreground/85">
        {listBuf.map((l, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: l.replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground">$1</strong>') }} />
        ))}
      </ul>
    );
    listBuf = [];
  };
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (line.startsWith("# ")) { flushList(idx); out.push(<h2 key={idx} className="text-lg font-semibold mt-1 mb-2">{line.slice(2)}</h2>); }
    else if (line.startsWith("## ")) { flushList(idx); out.push(<h3 key={idx} className="text-sm font-semibold mt-4 mb-1 text-foreground/90">{line.slice(3)}</h3>); }
    else if (line.startsWith("- ")) { listBuf.push(line.slice(2)); }
    else if (line === "") { flushList(idx); }
    else { flushList(idx); out.push(<p key={idx} className="text-sm text-muted-foreground my-1">{line}</p>); }
  });
  flushList(9999);
  return out;
}

export function BrainStatePanel() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("brain_state_snapshots")
      .select("*")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    setSnap(data as Snapshot | null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const { error } = await supabase.functions.invoke("ai-brain-snapshot");
      if (error) throw error;
      toast.success("Brain state refreshed");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Brain State
            {snap && (
              <Badge variant="outline" className="text-[10px] font-normal">
                {formatDistanceToNow(new Date(snap.created_at), { addSuffix: true })}
              </Badge>
            )}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          The exact business briefing your AI sees on every conversation. Auto-refreshes daily at 6 AM UTC.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !snap ? (
          <p className="text-sm text-muted-foreground">No snapshot yet. Click Refresh to generate one.</p>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            {renderMarkdown(snap.summary_md)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}