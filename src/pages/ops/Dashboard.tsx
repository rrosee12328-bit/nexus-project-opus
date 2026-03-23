import { useState } from "react";
import AICommandCenter from "@/components/AICommandCenter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLogger";
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
import { Plus, GripVertical, CheckSquare, Clock, AlertTriangle, TrendingUp, Calendar, Star, User } from "lucide-react";
import { motion } from "framer-motion";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { format, isPast, isToday, parseISO } from "date-fns";
import TaskDetailDialog from "@/components/tasks/TaskDetailDialog";
import TodayFocusPanel from "@/components/tasks/TodayFocusPanel";
import type { Database } from "@/integrations/supabase/types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type TaskStatus = Database["public"]["Enums"]["task_status"];
type TaskPriority = Database["public"]["Enums"]["task_priority"];

interface TaskWithClient extends Task {
  clients: { name: string } | null;
}

const columns: { key: TaskStatus; label: string; icon: typeof CheckSquare; accent: string }[] = [
  { key: "todo", label: "To Do", icon: CheckSquare, accent: "border-t-muted-foreground/40" },
  { key: "in_progress", label: "In Progress", icon: Clock, accent: "border-t-primary" },
  { key: "review", label: "Review", icon: AlertTriangle, accent: "border-t-amber-500" },
  { key: "done", label: "Done", icon: TrendingUp, accent: "border-t-emerald-500" },
];

const priorityColor: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/20 text-primary",
  high: "bg-amber-500/20 text-amber-600",
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
  const [newAssignedTo, setNewAssignedTo] = useState("");
  const [selectedTask, setSelectedTask] = useState<TaskWithClient | null>(null);

  const { data: tasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*, clients(name)").order("sort_order");
      if (error) throw error;
      return data as TaskWithClient[];
    },
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role, profiles!inner(display_name)")
        .in("role", ["admin", "ops"]);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.user_id,
        name: r.profiles?.display_name ?? r.user_id.slice(0, 8),
        role: r.role,
      }));
    },
  });

  const addTask = useMutation({
    mutationFn: async () => {
      if (!newTitle.trim()) throw new Error("Title required");
      const colTasks = tasksByStatus(addColumn!);
      const maxOrder = colTasks.length > 0 ? Math.max(...colTasks.map(t => t.sort_order)) + 1 : 0;
      const { error } = await supabase.from("tasks").insert({
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        status: addColumn!,
        priority: newPriority,
        assigned_to: newAssignedTo || null,
        sort_order: maxOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      logActivity("created_task", "task", null, `Created task: "${newTitle.trim()}" in ${columns.find(c => c.key === addColumn)?.label}`);
      setAddColumn(null);
      setNewTitle("");
      setNewDescription("");
      setNewPriority("medium");
      setNewAssignedTo("");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; status: TaskStatus; sort_order: number }[]) => {
      // Batch update sort orders
      for (const u of updates) {
        const { error } = await supabase.from("tasks").update({ status: u.status, sort_order: u.sort_order }).eq("id", u.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const srcCol = result.source.droppableId as TaskStatus;
    const destCol = result.destination.droppableId as TaskStatus;
    const srcIdx = result.source.index;
    const destIdx = result.destination.index;
    const taskId = result.draggableId;

    if (srcCol === destCol && srcIdx === destIdx) return;

    const allTasks = [...(tasks ?? [])];
    const srcItems = allTasks.filter(t => t.status === srcCol).sort((a, b) => a.sort_order - b.sort_order);
    const [moved] = srcItems.splice(srcIdx, 1);
    if (!moved) return;

    if (srcCol === destCol) {
      // Reorder within same column
      srcItems.splice(destIdx, 0, moved);
      const updates = srcItems.map((t, i) => ({ id: t.id, status: srcCol, sort_order: i }));
      reorderMutation.mutate(updates);
    } else {
      // Move to different column
      moved.status = destCol;
      const destItems = allTasks.filter(t => t.status === destCol && t.id !== moved.id).sort((a, b) => a.sort_order - b.sort_order);
      destItems.splice(destIdx, 0, moved);
      const srcUpdates = srcItems.map((t, i) => ({ id: t.id, status: srcCol, sort_order: i }));
      const destUpdates = destItems.map((t, i) => ({ id: t.id, status: destCol, sort_order: i }));
      reorderMutation.mutate([...srcUpdates, ...destUpdates]);
      logActivity("updated_task", "task", taskId, `Moved "${moved.title}" to ${columns.find(c => c.key === destCol)?.label}`);
    }

    // Optimistic update
    queryClient.setQueryData(["tasks"], () => {
      const updated = [...allTasks];
      const task = updated.find(t => t.id === taskId);
      if (task) task.status = destCol;
      return updated;
    });
  };

  const tasksByStatus = (status: TaskStatus) => (tasks ?? []).filter((t) => t.status === status).sort((a, b) => a.sort_order - b.sort_order);

  const getAssigneeName = (userId: string | null) => {
    if (!userId) return null;
    return teamMembers.find((m) => m.id === userId)?.name ?? null;
  };

  const todoCount = tasksByStatus("todo").length;
  const ipCount = tasksByStatus("in_progress").length;
  const reviewCount = tasksByStatus("review").length;
  const doneToday = tasksByStatus("done").filter(
    (t) => new Date(t.updated_at).toDateString() === new Date().toDateString()
  ).length;
  const statValues = [todoCount, ipCount, reviewCount, doneToday];

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-2xl font-bold tracking-tight">Ops Dashboard</h1>
        <p className="text-muted-foreground">Your team's task overview and project status.</p>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats_icons.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 + i * 0.07 }}>
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

      {/* Today's Focus */}
      <TodayFocusPanel tasks={tasks ?? []} teamMembers={teamMembers} onTaskClick={setSelectedTask} />

      {/* Kanban */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.4 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {columns.map((col) => (
            <div key={col.key} className="flex flex-col">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <col.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">{col.label}</span>
                  <Badge variant="secondary" className="text-xs font-mono">{tasksByStatus(col.key).length}</Badge>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAddColumn(col.key)}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <Droppable droppableId={col.key}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex flex-col gap-2 min-h-[200px] rounded-lg border border-t-2 p-2 transition-all ${col.accent} ${
                      snapshot.isDraggingOver ? "border-primary/50 bg-primary/5 scale-[1.01]" : "border-border bg-card/50"
                    }`}
                  >
                    {tasksByStatus(col.key).map((task, index) => {
                      const isOverdue = task.due_date && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date)) && task.status !== "done";
                      const isDueToday = task.due_date && isToday(parseISO(task.due_date));
                      const assignee = getAssigneeName(task.assigned_to);

                      return (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`transition-transform ${snapshot.isDragging ? "rotate-[2deg] scale-105" : ""}`}
                            >
                              <Card
                                className={`cursor-pointer transition-all hover:shadow-md ${
                                  snapshot.isDragging ? "shadow-xl border-primary/40 ring-1 ring-primary/20" : ""
                                } ${isOverdue ? "border-destructive/40" : ""}`}
                                onClick={() => setSelectedTask(task)}
                              >
                                <CardContent className="p-3 space-y-2">
                                  <div className="flex items-start gap-2">
                                    <div {...provided.dragHandleProps} className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing opacity-40 hover:opacity-100 transition-opacity">
                                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <p className={`text-sm font-medium leading-tight flex-1 ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                                      {task.title}
                                    </p>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        supabase.from("tasks").update({ daily_focus: !(task as any).daily_focus } as any).eq("id", task.id).then(() => {
                                          queryClient.invalidateQueries({ queryKey: ["tasks"] });
                                        });
                                      }}
                                      className="p-0.5 rounded hover:bg-accent transition-colors shrink-0"
                                      title={(task as any).daily_focus ? "Remove from today's focus" : "Add to today's focus"}
                                    >
                                      <Star className={`h-3.5 w-3.5 ${(task as any).daily_focus ? "text-primary fill-primary" : "text-muted-foreground/30 hover:text-muted-foreground/60"}`} />
                                    </button>
                                  </div>
                                  {task.description && (
                                    <p className="text-xs text-muted-foreground pl-6 line-clamp-2">{task.description}</p>
                                  )}
                                  <div className="flex items-center gap-1.5 pl-6 flex-wrap">
                                    <Badge variant="outline" className={`text-[10px] h-5 ${priorityColor[task.priority]}`}>{task.priority}</Badge>
                                    {task.clients?.name && (
                                      <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{task.clients.name}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between pl-6">
                                    {task.due_date ? (
                                      <span className={`text-[10px] flex items-center gap-1 ${
                                        isOverdue ? "text-destructive font-semibold" : isDueToday ? "text-primary font-medium" : "text-muted-foreground"
                                      }`}>
                                        <Calendar className="h-3 w-3" />
                                        {isOverdue ? "Overdue · " : isDueToday ? "Today · " : ""}
                                        {format(parseISO(task.due_date), "MMM d")}
                                      </span>
                                    ) : <span />}
                                    {assignee && (
                                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                        <User className="h-2.5 w-2.5" />
                                        {assignee}
                                      </span>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </motion.div>
      </DragDropContext>

      {/* Add Task Dialog */}
      <Dialog open={!!addColumn} onOpenChange={(open) => !open && setAddColumn(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Task to {columns.find((c) => c.key === addColumn)?.label}</DialogTitle>
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
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={newAssignedTo || "none"} onValueChange={(v) => setNewAssignedTo(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name} ({m.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      {/* Task Detail Dialog */}
      <TaskDetailDialog task={selectedTask} open={!!selectedTask} onClose={() => setSelectedTask(null)} />
    </div>
  );
}
