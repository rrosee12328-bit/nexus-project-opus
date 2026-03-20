import { useState } from "react";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Plus, Search, ListChecks, CheckSquare, Clock, AlertTriangle,
  TrendingUp, Pencil, Trash2, Filter, Calendar, ArrowUpDown,
} from "lucide-react";
import { motion } from "framer-motion";
import TaskDetailDialog from "@/components/tasks/TaskDetailDialog";
import type { Database } from "@/integrations/supabase/types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type TaskStatus = Database["public"]["Enums"]["task_status"];
type TaskPriority = Database["public"]["Enums"]["task_priority"];

const STATUS_CONFIG: Record<TaskStatus, { label: string; icon: typeof CheckSquare; color: string }> = {
  todo: { label: "To Do", icon: CheckSquare, color: "bg-muted text-muted-foreground" },
  in_progress: { label: "In Progress", icon: Clock, color: "bg-primary/15 text-primary border-primary/30" },
  review: { label: "Review", icon: AlertTriangle, color: "bg-warning/15 text-warning border-warning/30" },
  done: { label: "Done", icon: TrendingUp, color: "bg-success/15 text-success border-success/30" },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; sort: number }> = {
  urgent: { label: "Urgent", color: "bg-destructive/15 text-destructive border-destructive/30", sort: 0 },
  high: { label: "High", color: "bg-warning/15 text-warning border-warning/30", sort: 1 },
  medium: { label: "Medium", color: "bg-primary/15 text-primary border-primary/30", sort: 2 },
  low: { label: "Low", color: "bg-muted text-muted-foreground", sort: 3 },
};

const STAT_CARDS = [
  { key: "todo" as TaskStatus, label: "To Do", icon: CheckSquare },
  { key: "in_progress" as TaskStatus, label: "In Progress", icon: Clock },
  { key: "review" as TaskStatus, label: "In Review", icon: AlertTriangle },
  { key: "done" as TaskStatus, label: "Completed", icon: TrendingUp },
];

type TaskForm = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string;
  client_id: string;
};

const emptyForm: TaskForm = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  due_date: "",
  client_id: "",
};

export default function OpsTasks() {
  const queryClient = useQueryClient();

  // UI state
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "all">("all");
  const [sortField, setSortField] = useState<"priority" | "due_date" | "created_at">("priority");

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  // Data fetching
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["ops-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, clients(name)")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["ops-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .in("status", ["active", "onboarding"])
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title is required");
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        due_date: form.due_date || null,
        client_id: form.client_id || null,
      };
      if (editId) {
        const { error } = await supabase.from("tasks").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tasks").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Task updated" : "Task created");
      queryClient.invalidateQueries({ queryKey: ["ops-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      logActivity(
        editId ? "updated_task" : "created_task",
        "task",
        editId,
        editId ? `Updated task "${form.title}"` : `Created task "${form.title}"`,
      );
      closeForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      toast.success("Task deleted");
      queryClient.invalidateQueries({ queryKey: ["ops-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      logActivity("deleted_task", "task", id, "Deleted a task");
      setDeleteTarget(null);
    },
    onError: () => toast.error("Failed to delete task"),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["ops-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      logActivity("changed_task_status", "task", vars.id, `Changed task status to ${vars.status}`);
    },
  });

  // Helpers
  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditId(task.id);
    setForm({
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      priority: task.priority,
      due_date: task.due_date ?? "",
      client_id: task.client_id ?? "",
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditId(null);
    setForm(emptyForm);
  };

  // Filtering & sorting
  const filtered = tasks
    .filter((t) => {
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
          !(t.description ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortField === "priority") {
        return PRIORITY_CONFIG[a.priority].sort - PRIORITY_CONFIG[b.priority].sort;
      }
      if (sortField === "due_date") {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const countByStatus = (s: TaskStatus) => tasks.filter((t) => t.status === s).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground">Manage priorities, assignments, and track progress.</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </motion.div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map((s, i) => (
          <motion.div
            key={s.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.07 }}
          >
            <Card
              className={`hover:border-primary/20 transition-colors cursor-pointer ${filterStatus === s.key ? "border-primary/40" : ""}`}
              onClick={() => setFilterStatus(filterStatus === s.key ? "all" : s.key)}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">{countByStatus(s.key)}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
      >
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tasks…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as TaskStatus | "all")}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterPriority} onValueChange={(v) => setFilterPriority(v as TaskPriority | "all")}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortField} onValueChange={(v) => setSortField(v as typeof sortField)}>
                <SelectTrigger className="w-[150px]">
                  <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="priority">Sort: Priority</SelectItem>
                  <SelectItem value="due_date">Sort: Due Date</SelectItem>
                  <SelectItem value="created_at">Sort: Newest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Task table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed border-2 border-border">
            <CardContent className="py-16 flex flex-col items-center text-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <ListChecks className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  {tasks.length === 0 ? "No tasks yet" : "No tasks match your filters"}
                </h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  {tasks.length === 0
                    ? "Create your first task to start tracking work."
                    : "Try adjusting your search or filter criteria."}
                </p>
              </div>
              {tasks.length === 0 && (
                <Button onClick={openCreate} className="gap-2 mt-2">
                  <Plus className="h-4 w-4" /> Create Task
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Task</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead className="hidden md:table-cell">Client</TableHead>
                    <TableHead className="hidden lg:table-cell">Due Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((task) => {
                    const statusCfg = STATUS_CONFIG[task.status];
                    const priorityCfg = PRIORITY_CONFIG[task.priority];
                    const clientName = (task.clients as { name: string } | null)?.name;
                    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "done";

                    return (
                      <TableRow key={task.id} className="hover:bg-muted/30 transition-colors group">
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{task.title}</p>
                            {task.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={task.status}
                            onValueChange={(v) => statusMutation.mutate({ id: task.id, status: v as TaskStatus })}
                          >
                            <SelectTrigger className="h-7 w-[120px] text-xs border-0 bg-transparent hover:bg-muted/50">
                              <Badge variant="outline" className={`text-xs ${statusCfg.color}`}>
                                {statusCfg.label}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                                <SelectItem key={k} value={k}>{v.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${priorityCfg.color}`}>
                            {priorityCfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-sm text-muted-foreground">{clientName ?? "—"}</span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {task.due_date ? (
                            <span className={`text-sm flex items-center gap-1.5 ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                              <Calendar className="h-3.5 w-3.5" />
                              {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              {isOverdue && <span className="text-xs">(overdue)</span>}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(task)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget({ id: task.id, title: task.title })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Task" : "New Task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="What needs to be done?"
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TaskStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as TaskPriority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Client</Label>
                <Select value={form.client_id || "none"} onValueChange={(v) => setForm({ ...form, client_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional details…"
                maxLength={1000}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : editId ? "Save Changes" : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "<span className="font-medium text-foreground">{deleteTarget?.title}</span>". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
