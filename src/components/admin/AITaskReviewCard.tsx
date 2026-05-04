import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Bot, Check, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Task = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string;
  source_call_id: string | null;
};

export function AITaskReviewCard({ clientId }: { clientId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editPriority, setEditPriority] = useState("medium");

  const load = async () => {
    const { data } = await supabase
      .from("tasks")
      .select("id, title, description, due_date, priority, source_call_id")
      .eq("client_id", clientId)
      .eq("ai_generated", true)
      .eq("needs_review", true)
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    setTasks((data ?? []) as any);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`aitasks-${clientId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `client_id=eq.${clientId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId]);

  const startEdit = (t: Task) => {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditDue(t.due_date ?? "");
    setEditPriority(t.priority);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase
      .from("tasks")
      .update({ title: editTitle, due_date: editDue || null, priority: editPriority as any })
      .eq("id", editingId);
    if (error) return toast.error(error.message);
    setEditingId(null);
    toast.success("Task updated");
  };

  const approve = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("tasks")
      .update({ needs_review: false, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Task approved");
  };

  const dismiss = async (id: string) => {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Task dismissed");
  };

  const approveAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const ids = tasks.map((t) => t.id);
    if (!ids.length) return;
    const { error } = await supabase
      .from("tasks")
      .update({ needs_review: false, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Approved ${ids.length} tasks`);
  };

  if (!tasks.length) return null;

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            AI-proposed tasks needing review
            <Badge variant="secondary" className="text-xs">{tasks.length}</Badge>
          </CardTitle>
          <Button size="sm" variant="default" onClick={approveAll}>
            <Check className="h-3.5 w-3.5 mr-1" /> Approve all
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="rounded-md border bg-card p-3">
              {editingId === t.id ? (
                <div className="space-y-2">
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Task title" />
                  <div className="flex gap-2 flex-wrap">
                    <Input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} className="w-auto" />
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value)}
                      className="border rounded-md px-2 text-sm bg-background"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                    <Button size="sm" onClick={saveEdit}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{t.title}</p>
                    {t.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>}
                    <div className="flex gap-2 mt-1 items-center">
                      <Badge variant="outline" className="text-[10px] capitalize">{t.priority}</Badge>
                      {t.due_date && <span className="text-[10px] text-muted-foreground font-mono">Due {t.due_date}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => approve(t.id)}>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => dismiss(t.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}