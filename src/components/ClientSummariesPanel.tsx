import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Search, Circle } from "lucide-react";
import { format } from "date-fns";

const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  onboarding: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  prospect: "bg-primary/15 text-primary border-primary/30",
  lead: "bg-violet-500/15 text-violet-600 border-violet-500/30",
  closed: "bg-muted text-muted-foreground border-border",
};

type ClientWithNote = {
  id: string;
  name: string;
  status: string;
  monthly_fee: number | null;
  latest_note: { title: string; content: string | null; created_at: string } | null;
};

interface ClientSummariesPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClientSummariesPanel({ open, onOpenChange }: ClientSummariesPanelProps) {
  const [search, setSearch] = useState("");

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["client-summaries-panel"],
    queryFn: async () => {
      // Fetch clients
      const { data: clientRows, error: cErr } = await supabase
        .from("clients")
        .select("id, name, status, monthly_fee")
        .order("name");
      if (cErr) throw cErr;

      // Fetch latest note per client
      const { data: notes, error: nErr } = await supabase
        .from("client_notes")
        .select("client_id, title, content, created_at")
        .order("created_at", { ascending: false });
      if (nErr) throw nErr;

      // Group: keep only latest note per client
      const latestByClient = new Map<string, (typeof notes)[0]>();
      for (const n of notes ?? []) {
        if (!latestByClient.has(n.client_id)) {
          latestByClient.set(n.client_id, n);
        }
      }

      return (clientRows ?? []).map((c) => {
        const note = latestByClient.get(c.id);
        return {
          ...c,
          latest_note: note
            ? { title: note.title, content: note.content, created_at: note.created_at }
            : null,
        } as ClientWithNote;
      });
    },
    enabled: open,
    staleTime: 30_000,
  });

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  // Sort: clients with notes first, then alphabetical
  const sorted = [...filtered].sort((a, b) => {
    if (a.latest_note && !b.latest_note) return -1;
    if (!a.latest_note && b.latest_note) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[380px] sm:w-[420px] p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border space-y-3">
          <SheetTitle className="text-base font-semibold">Client Summaries</SheetTitle>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </SheetHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {isLoading && (
              <div className="text-xs text-muted-foreground text-center py-8">Loading…</div>
            )}

            {!isLoading && sorted.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-8">No clients found.</div>
            )}

            {sorted.map((client) => (
              <div
                key={client.id}
                className="rounded-lg border border-border/50 bg-card p-3 space-y-2 hover:border-border transition-colors"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Circle className="h-2 w-2 flex-shrink-0 fill-current text-primary/60" />
                    <span className="text-sm font-medium truncate">{client.name}</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 shrink-0 capitalize ${STATUS_COLOR[client.status] ?? ""}`}
                  >
                    {client.status}
                  </Badge>
                </div>

                {/* Monthly fee */}
                {client.monthly_fee != null && client.monthly_fee > 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    ${client.monthly_fee.toLocaleString()}/mo
                  </div>
                )}

                {/* Latest note */}
                {client.latest_note ? (
                  <div className="bg-muted/40 rounded-md px-2.5 py-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-foreground/80 truncate">
                        {client.latest_note.title}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                        {format(new Date(client.latest_note.created_at), "MMM d")}
                      </span>
                    </div>
                    {client.latest_note.content && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
                        {client.latest_note.content}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground/60 italic">No notes yet</p>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
