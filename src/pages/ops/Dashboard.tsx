import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, GripVertical, CheckSquare, Clock, AlertTriangle, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import type { Database } from "@/integrations/supabase/types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type TaskStatus = Database["public"]["Enums"]["task_status"];
type TaskPriority = Database["public"]["Enums"]["task_priority"];

const columns: { key: TaskStatus; label: string; icon: typeof CheckSquare }[] = [
  { key: "todo", label: "To Do", icon: CheckSquare },
  { key: "in_progress", label: "In Progress", icon: Clock },
  { key: "review", label: "Review", icon: AlertTriangle },
  { key: "done", label: "Done", icon: TrendingUp },
];

const priorityColor: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/20 text-primary",
  high: "bg-warning/20 text-warning",
  urgent: "bg-destructive/20 text-destructive",
};

const stats_icons = [
  { label: "Open Tasks", icon: CheckSquare },
  { label: "In Progress", icon: Clock },
  { label: "In Review", icon: AlertTriangle },
  { label: "Completed Today", icon: TrendingUp },
];

export default function OpsDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addColumn, setAddColumn] = useState<TaskStatus | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("medium");
  const [newDescription, setNewDescription] = useState("");

  const { data: tasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*, clients(name)").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const addTask = useMutation({
    mutationFn: async () => {
      if (!newTitle.trim()) throw new Error("Title required");
      const { error } = await supabase.from("tasks").insert({
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        status: addColumn!,
        priority: newPriority,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setAddColumn(null);
      setNewTitle("");
      setNewDescription("");
      setNewPriority("medium");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const moveTask = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const tasksByStatus = (status: TaskStatus) => (tasks ?? []).filter((t) => t.status === status);

  const todoCount = tasksByStatus("todo").length;
  const ipCount = tasksByStatus("in_progress").length;
  const reviewCount = tasksByStatus("review").length;
  const doneToday = tasksByStatus("done").filter(
    (t) => new Date(t.updated_at).toDateString() === new Date().toDateString()
  ).length;

  const statValues = [todoCount, ipCount, reviewCount, doneToday];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-2xl font-bold tracking-tight">Ops Dashboard</h1>
        <p className="text-muted-foreground">Your team's task overview and project status.</p>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats_icons.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.07 }}
          >
            <Card className="hover:border-primary/20 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">{statValues[i]}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Kanban Board */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {columns.map((col) => (
          <div key={col.key} className="flex flex-col">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <col.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">{col.label}</span>
                <Badge variant="secondary" className="text-xs font-mono">
                  {tasksByStatus(col.key).length}
                </Badge>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAddColumn(col.key)}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex flex-col gap-2 min-h-[200px] rounded-lg border border-border bg-surface/50 p-2">
              {tasksByStatus(col.key).map((task) => (
                <Card key={task.id} className="cursor-default hover:border-primary/20 transition-colors">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <p className="text-sm font-medium leading-tight flex-1">{task.title}</p>
                    </div>
                    {task.description && (
                      <p className="text-xs text-muted-foreground pl-6 line-clamp-2">{task.description}</p>
                    )}
                    <div className="flex items-center justify-between pl-6">
                      <Badge variant="outline" className={`text-xs ${priorityColor[task.priority]}`}>
                        {task.priority}
                      </Badge>
                      {(task.clients as { name: string } | null)?.name && (
                        <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                          {(task.clients as { name: string }).name}
                        </span>
                      )}
                    </div>
                    {/* Quick move buttons */}
                    <div className="flex gap-1 pl-6 pt-1">
                      {columns
                        .filter((c) => c.key !== col.key)
                        .map((c) => (
                          <Button
                            key={c.key}
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={() => moveTask.mutate({ id: task.id, status: c.key })}
                          >
                            → {c.label}
                          </Button>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </motion.div>

      {/* Add Task Dialog */}
      <Dialog open={!!addColumn} onOpenChange={(open) => !open && setAddColumn(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Add Task to {columns.find((c) => c.key === addColumn)?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Task title" maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={newPriority} onValueChange={(v) => setNewPriority(v as TaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Optional description..." maxLength={1000} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddColumn(null)}>Cancel</Button>
            <Button onClick={() => addTask.mutate()} disabled={addTask.isPending}>
              {addTask.isPending ? "Adding..." : "Add Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
