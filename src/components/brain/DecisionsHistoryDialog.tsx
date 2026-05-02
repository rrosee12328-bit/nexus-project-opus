import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { Check, X, CircleSlash } from "lucide-react";

type HistRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  recommendation: string | null;
  status: string;
  risk_tier: string;
  created_at: string;
  resolved_at: string | null;
};

const ICON: Record<string, any> = {
  approved: Check,
  rejected: X,
  dismissed: CircleSlash,
};

const TONE: Record<string, string> = {
  approved: "text-emerald-600",
  rejected: "text-destructive",
  dismissed: "text-muted-foreground",
};

export function DecisionsHistoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [rows, setRows] = useState<HistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "approved" | "rejected" | "dismissed">("all");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("ai_decision_queue")
        .select("id, type, title, body, recommendation, status, risk_tier, created_at, resolved_at")
        .neq("status", "pending")
        .order("resolved_at", { ascending: false })
        .limit(200);
      setRows((data ?? []) as HistRow[]);
      setLoading(false);
    })();
  }, [open]);

  const filtered = rows.filter((r) => filter === "all" || r.status === filter);

  const counts = {
    all: rows.length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    dismissed: rows.filter((r) => r.status === "dismissed").length,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Decisions history</DialogTitle>
          <DialogDescription>
            Past AI suggestions and how you resolved them. Use this to evaluate whether the watcher is earning its keep.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
            <TabsTrigger value="approved">Acted on ({counts.approved})</TabsTrigger>
            <TabsTrigger value="rejected">Wrong call ({counts.rejected})</TabsTrigger>
            <TabsTrigger value="dismissed">Dismissed ({counts.dismissed})</TabsTrigger>
          </TabsList>
        </Tabs>
        <ScrollArea className="h-[55vh] pr-3">
          {loading ? (
            <p className="text-sm text-muted-foreground p-2">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2">Nothing here yet.</p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((r) => {
                const Icon = ICON[r.status] ?? CircleSlash;
                return (
                  <li key={r.id} className="rounded-md border bg-card p-3">
                    <div className="flex items-start gap-3">
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${TONE[r.status] ?? ""}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{r.title}</span>
                          <Badge variant="outline" className="text-[10px] font-mono">{r.type}</Badge>
                          <Badge variant="outline" className="text-[10px] font-mono">{r.risk_tier}</Badge>
                        </div>
                        {r.body && <p className="text-xs text-muted-foreground mt-1">{r.body}</p>}
                        <p className="text-[10px] text-muted-foreground mt-1.5 font-mono">
                          flagged {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                          {r.resolved_at && ` · resolved ${formatDistanceToNow(new Date(r.resolved_at), { addSuffix: true })}`}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}