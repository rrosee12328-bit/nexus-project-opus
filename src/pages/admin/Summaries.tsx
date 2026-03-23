import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
              <article className="px-6 md:px-10 py-6 md:py-8 max-w-4xl prose prose-sm dark:prose-invert prose-headings:text-foreground prose-p:text-foreground/80 prose-strong:text-foreground prose-td:text-foreground/80 prose-th:text-foreground prose-th:font-semibold">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
