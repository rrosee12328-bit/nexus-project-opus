import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, FileText, Calendar, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Summary = {
  id: string;
  title: string;
  content: string;
  summary_date: string;
  created_at: string;
};

export default function AdminSummaries() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newContent, setNewContent] = useState("");

  const { data: summaries = [], isLoading } = useQuery({
    queryKey: ["company-summaries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_summaries")
        .select("id, title, content, summary_date, created_at")
        .order("summary_date", { ascending: false });
      if (error) throw error;
      return data as Summary[];
    },
  });

  const selected = summaries.find((s) => s.id === selectedId) ?? summaries[0] ?? null;

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("company_summaries").insert({
        title: newTitle,
        content: newContent,
        summary_date: newDate,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-summaries"] });
      setDialogOpen(false);
      setNewTitle("");
      setNewContent("");
      toast.success("Summary added");
    },
    onError: () => toast.error("Failed to save summary"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("company_summaries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-summaries"] });
      setSelectedId(null);
      toast.success("Summary deleted");
    },
  });

  return (
    <div className="flex h-[calc(100vh-3.5rem)] md:h-[calc(100vh-3.5rem)] overflow-hidden -m-3 sm:-m-4 md:-m-6">
      {/* Left: date list */}
      <div className="w-64 border-r border-border flex flex-col bg-muted/30 shrink-0">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Summaries</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New Summary Report</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <Input
                  placeholder="Title (e.g. March 2026 Status Report)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
                <Input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
                <Textarea
                  placeholder="Paste your summary content here (Markdown supported)..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="min-h-[300px] font-mono text-xs"
                />
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!newTitle || !newContent || createMutation.isPending}
                  className="w-full"
                >
                  {createMutation.isPending ? "Saving..." : "Save Summary"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {isLoading && (
              <p className="text-xs text-muted-foreground text-center py-8">Loading…</p>
            )}
            {summaries.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm ${
                  selected?.id === s.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-muted text-foreground/80"
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  <span className="truncate">{s.title}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 ml-5.5">
                  <Calendar className="h-3 w-3 opacity-40" />
                  <span className="text-[11px] text-muted-foreground">
                    {format(new Date(s.summary_date), "MMMM d, yyyy")}
                  </span>
                </div>
              </button>
            ))}
            {!isLoading && summaries.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">
                No summaries yet. Click + to add one.
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right: document view */}
      <div className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <>
            <div className="px-6 md:px-10 py-4 border-b border-border flex items-center justify-between shrink-0">
              <div>
                <h1 className="text-lg font-bold text-foreground">{selected.title}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(selected.summary_date), "MMMM d, yyyy")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (confirm("Delete this summary?")) deleteMutation.mutate(selected.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <article className="px-6 md:px-10 lg:px-16 py-6 md:py-10 max-w-4xl mx-auto summary-doc">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-2xl font-bold text-foreground mb-1 tracking-tight">{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-lg font-bold text-foreground mt-8 mb-4 pb-2 border-b border-border">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-base font-semibold text-foreground mt-5 mb-2">{children}</h3>
                    ),
                    p: ({ children }) => (
                      <p className="text-sm text-foreground/80 leading-relaxed mb-3">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="space-y-1.5 mb-4 ml-1">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="space-y-2 mb-4 ml-1 list-decimal list-inside">{children}</ol>
                    ),
                    li: ({ children }) => (
                      <li className="text-sm text-foreground/80 leading-relaxed pl-1">{children}</li>
                    ),
                    strong: ({ children }) => (
                      <strong className="text-foreground font-semibold">{children}</strong>
                    ),
                    hr: () => (
                      <div className="my-6 border-t border-border/60" />
                    ),
                    table: ({ children }) => (
                      <div className="my-4 rounded-lg border border-border overflow-hidden">
                        <table className="w-full text-sm">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-muted/60">{children}</thead>
                    ),
                    th: ({ children }) => (
                      <th className="text-left text-xs font-semibold text-foreground px-3 py-2.5 border-b border-border">{children}</th>
                    ),
                    td: ({ children }) => (
                      <td className="text-sm text-foreground/80 px-3 py-2.5 border-b border-border/40">{children}</td>
                    ),
                    tr: ({ children }) => (
                      <tr className="hover:bg-muted/30 transition-colors">{children}</tr>
                    ),
                  }}
                >
                  {selected.content}
                </ReactMarkdown>
              </article>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <div className="text-center space-y-2">
              <FileText className="h-10 w-10 mx-auto opacity-30" />
              <p>Select a summary or create a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
