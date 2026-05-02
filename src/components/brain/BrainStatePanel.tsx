import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, RefreshCw, History } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [selectedHistId, setSelectedHistId] = useState<string | null>(null);

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

  const openHistory = async () => {
    setHistoryOpen(true);
    const { data } = await supabase
      .from("brain_state_snapshots")
      .select("*")
      .order("snapshot_date", { ascending: false })
      .limit(30);
    const list = (data ?? []) as Snapshot[];
    setHistory(list);
    if (list.length > 1) setSelectedHistId(list[1].id); // default to previous (not current)
    else if (list.length > 0) setSelectedHistId(list[0].id);
  };

  const selectedHist = history.find((h) => h.id === selectedHistId) ?? null;

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
    <>
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
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={openHistory}>
              <History className="h-3.5 w-3.5 mr-1.5" />
              History
            </Button>
            <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
              Regenerate now
            </Button>
          </div>
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

    <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Brain State history</DialogTitle>
          <DialogDescription>
            Compare a previous daily snapshot to see how the business state has shifted.
          </DialogDescription>
        </DialogHeader>
        <Select value={selectedHistId ?? ""} onValueChange={setSelectedHistId}>
          <SelectTrigger className="w-full sm:w-[280px]">
            <SelectValue placeholder="Pick a snapshot" />
          </SelectTrigger>
          <SelectContent>
            {history.map((h) => (
              <SelectItem key={h.id} value={h.id}>
                {h.snapshot_date} · {formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ScrollArea className="h-[55vh] pr-3 mt-2">
          {selectedHist ? (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              {renderMarkdown(selectedHist.summary_md)}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No snapshots stored yet.</p>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
    </>
  );
}