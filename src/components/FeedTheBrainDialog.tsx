import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Brain, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Client = { id: string; name: string };

const MEMORY_TYPES = [
  { value: "general", label: "General Knowledge" },
  { value: "client_context", label: "Client Context" },
  { value: "process", label: "Process / SOP" },
  { value: "decision", label: "Decision / Policy" },
  { value: "meeting", label: "Meeting Note" },
];

export function FeedTheBrainButton({ defaultClientId }: { defaultClientId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Brain className="h-3.5 w-3.5" />
        Feed the Brain
      </Button>
      <FeedTheBrainDialog open={open} onOpenChange={setOpen} defaultClientId={defaultClientId} />
    </>
  );
}

export function FeedTheBrainDialog({
  open,
  onOpenChange,
  defaultClientId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultClientId?: string;
}) {
  const queryClient = useQueryClient();
  const [memoryType, setMemoryType] = useState("general");
  const [clientId, setClientId] = useState<string>(defaultClientId ?? "");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return (data || []) as Client[];
    },
  });

  const labelFor = (v: string) => MEMORY_TYPES.find((t) => t.value === v)?.label ?? v;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!content.trim()) throw new Error("Content is required");
      const fallbackTitle = title || `${labelFor(memoryType)} — ${new Date().toLocaleDateString()}`;

      if (memoryType === "process") {
        const { error } = await (supabase as any).from("sops").insert({
          title: title || "Untitled Process",
          content: content.trim(),
          category: "general",
        });
        if (error) throw error;
      } else if (memoryType === "client_context" || memoryType === "meeting" || memoryType === "decision") {
        const { error } = await (supabase as any).from("client_notes").insert({
          client_id: clientId || null,
          title: fallbackTitle,
          content: content.trim(),
          type: memoryType === "meeting" ? "meeting" : "note",
        });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("company_summaries").insert({
          title: fallbackTitle,
          content: content.trim(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-notes"] });
      queryClient.invalidateQueries({ queryKey: ["company-summaries"] });
      queryClient.invalidateQueries({ queryKey: ["sops"] });
      toast.success("Saved to AI memory");
      setTitle("");
      setContent("");
      setMemoryType("general");
      setClientId(defaultClientId ?? "");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const showClientPicker = memoryType !== "process";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Feed the Brain
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Add knowledge, context, or notes to the AI's memory so it can reference this information in future conversations.
        </p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Memory Type</Label>
              <Select value={memoryType} onValueChange={setMemoryType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEMORY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {showClientPicker && (
              <div>
                <Label>Client (optional)</Label>
                <Select value={clientId || "none"} onValueChange={(v) => setClientId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="All Clients" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">All Clients (General)</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div>
            <Label>Title <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Input
              placeholder="e.g. Q2 Pricing Strategy"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <Label>Content</Label>
            <Textarea
              rows={8}
              placeholder="Paste or write the knowledge you want the AI to remember…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !content.trim()}
            className="gap-1.5"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Save to Memory
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}