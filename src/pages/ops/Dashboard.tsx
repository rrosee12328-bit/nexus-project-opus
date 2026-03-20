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
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Plus, GripVertical, CheckSquare, Clock, AlertTriangle, TrendingUp, Pencil, Trash2, Calendar, User } from "lucide-react";
import { motion } from "framer-motion";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { logActivity } from "@/lib/activityLogger";
import type { Database } from "@/integrations/supabase/types";
import { format } from "date-fns";

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

interface TaskWithClient extends Task {
  clients: { name: string } | null;
}

export default function OpsDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addColumn, setAddColumn] = useState<TaskStatus | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("medium");
  const [newDescription, setNewDescription] = useState("");
  const [selectedTask, setSelectedTask] = useState<TaskWithClient | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", description: "", priority: "medium" as TaskPriority, due_date: "" });

  const { data: tasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*, clients(name)").order("sort_order");
      if (error) throw error;
      return data as TaskWithClient[];
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
      logActivity("created_task", "task", null, `Created task: "${newTitle.trim()}" in ${columns.find(c => c.key === addColumn)?.label}`);
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
      return { id, status };
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      const task = (tasks ?? []).find(t => t.id === vars.id);
      if (task) {
        logActivity("updated_task", "task", vars.id, `Moved "${task.title}" to ${columns.find(c => c.key === vars.status)?.label}`);
      }
    },
  });

  const updateTask = useMutation({
    mutationFn: async () => {
      if (!selectedTask) return;
      const { error } = await supabase.from("tasks").update({
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        priority: editForm.priority,
        due_date: editForm.due_date || null,
      }).eq("id", selectedTask.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      logActivity("updated_task", "task", selectedTask?.id ?? null, `Updated task: "${editForm.title.trim()}"`);
      setEditMode(false);
      setSelectedTask(null);
      toast({ title: "Task updated" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      const task = (tasks ?? []).find(t => t.id === id);
      logActivity("deleted_task", "task", id, `Deleted task: "${task?.title ?? "Unknown"}"`);
      setSelectedTask(null);
      toast({ title: "Task deleted" });
    },
  });

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId as TaskStatus;
    const taskId = result.draggableId;
    const task = (tasks ?? []).find(t => t.id === taskId);
    if (task && task.status !== newStatus) {
      moveTask.mutate({ id: taskId, status: newStatus });
    }
  };

  const openTaskDetail = (task: TaskWithClient) => {
    setSelectedTask(task);
    setEditMode(false);
    setEditForm({
      title: task.title,
      description: task.description ?? "",
      priority: task.priority,
      due_date: task.due_date ?? "",
    });
  };

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

      {/* Kanban Board with Drag & Drop */}
      <DragDropContext onDragEnd={handleDragEnd}>
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
              <Droppable droppableId={col.key}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex flex-col gap-2 min-h-[200px] rounded-lg border p-2 transition-colors ${
                      snapshot.isDraggingOver
                        ? "border-primary/50 bg-primary/5"
                        : "border-border bg-surface/50"
                    }`}
                  >
                    {tasksByStatus(col.key).map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`${snapshot.isDragging ? "opacity-90 rotate-1" : ""}`}
                          >
                            <Card
                              className={`cursor-pointer hover:border-primary/30 transition-all ${
                                snapshot.isDragging ? "shadow-lg border-primary/40" : ""
                              }`}
                              onClick={() => openTaskDetail(task)}
                            >
                              <CardContent className="p-3 space-y-2">
                                <div className="flex items-start gap-2">
                                  <div
                                    {...provided.dragHandleProps}
                                    className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing"
                                  >
                                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                  <p className="text-sm font-medium leading-tight flex-1">{task.title}</p>
                                </div>
                                {task.description && (
                                  <p className="text-xs text-muted-foreground pl-6 line-clamp-2">{task.description}</p>
                                )}
                                <div className="flex items-center justify-between pl-6">
                                  <Badge variant="outline" className={`text-xs ${priorityColor[task.priority]}`}>
                                    {task.priority}
                                  </Badge>
                                  {task.clients?.name && (
                                    <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                                      {task.clients.name}
                                    </span>
                                  )}
                                </div>
                                {task.due_date && (
                                  <p className="text-xs text-muted-foreground pl-6 flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {format(new Date(task.due_date + "T00:00:00"), "MMM d, yyyy")}
                                  </p>
                                )}
                              </CardContent>
                            </Card>
                          </div>
                        )}
                      </Draggable>
                    ))}
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

      {/* Task Detail Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => { if (!open) { setSelectedTask(null); setEditMode(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-6">
              <span>{editMode ? "Edit Task" : "Task Details"}</span>
              {!editMode && selectedTask && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditMode(true)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => selectedTask && deleteTask.mutate(selectedTask.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedTask && !editMode && (
            <div className="space-y-4 py-2">
              <div>
                <h3 className="text-lg font-semibold">{selectedTask.title}</h3>
                {selectedTask.description && (
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{selectedTask.description}</p>
                )}
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Status</p>
                  <Badge variant="secondary">
                    {columns.find(c => c.key === selectedTask.status)?.label ?? selectedTask.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Priority</p>
                  <Badge variant="outline" className={priorityColor[selectedTask.priority]}>
                    {selectedTask.priority}
                  </Badge>
                </div>
                {selectedTask.clients?.name && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Client</p>
                    <span className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      {selectedTask.clients.name}
                    </span>
                  </div>
                )}
                {selectedTask.due_date && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Due Date</p>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      {format(new Date(selectedTask.due_date + "T00:00:00"), "MMM d, yyyy")}
                    </span>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Created</p>
                  <span>{format(new Date(selectedTask.created_at), "MMM d, yyyy")}</span>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Last Updated</p>
                  <span>{format(new Date(selectedTask.updated_at), "MMM d, yyyy")}</span>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-2">Move to</p>
                <div className="flex gap-2 flex-wrap">
                  {columns.filter(c => c.key !== selectedTask.status).map(c => (
                    <Button
                      key={c.key}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        moveTask.mutate({ id: selectedTask.id, status: c.key });
                        setSelectedTask(null);
                      }}
                    >
                      <c.icon className="h-3 w-3 mr-1.5" /> {c.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {selectedTask && editMode && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={editForm.title} onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={editForm.priority} onValueChange={(v) => setEditForm(f => ({ ...f, priority: v as TaskPriority }))}>
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
                <Label>Due Date</Label>
                <Input type="date" value={editForm.due_date} onChange={(e) => setEditForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={editForm.description} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} rows={4} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                <Button onClick={() => updateTask.mutate()} disabled={!editForm.title.trim() || updateTask.isPending}>
                  {updateTask.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
