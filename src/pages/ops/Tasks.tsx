import { useState, useEffect, useRef, useCallback } from "react";
import AICommandCenter from "@/components/AICommandCenter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLogger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  TrendingUp, Pencil, Trash2, Filter, Calendar, ArrowUpDown, GripVertical,
  Play, Square, Timer, Users, Building2,
} from "lucide-react";
import { motion } from "framer-motion";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import TaskDetailDialog from "@/components/tasks/TaskDetailDialog";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type TaskStatus = Database["public"]["Enums"]["task_status"];
type TaskPriority = Database["public"]["Enums"]["task_priority"];

const STATUS_CONFIG: Record<TaskStatus, { label: string; icon: typeof CheckSquare; color: string }> = {
  todo: { label: "To Do", icon: CheckSquare, color: "bg-muted text-muted-foreground" },
  in_progress: { label: "In Progress", icon: Clock, color: "bg-primary/15 text-primary border-primary/30" },
  review: { label: "Review", icon: AlertTriangle, color: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  done: { label: "Done", icon: TrendingUp, color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; sort: number }> = {
  urgent: { label: "Urgent", color: "bg-destructive/15 text-destructive border-destructive/30", sort: 0 },
  high: { label: "High", color: "bg-amber-500/15 text-amber-600 border-amber-500/30", sort: 1 },
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
  assigned_to: string;
};

const emptyForm: TaskForm = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  due_date: "",
  client_id: "",
  assigned_to: "",
};

// Timer hook
function useTaskTimer() {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback((taskId: string) => {
    // Stop any existing timer
    if (intervalRef.current) clearInterval(intervalRef.current);
    setActiveTaskId(taskId);
    setElapsed(0);
    startTimeRef.current = new Date();
    intervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsed(Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000));
      }
    }, 1000);
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const result = {
      taskId: activeTaskId,
      startTime: startTimeRef.current,
      endTime: new Date(),
      elapsed,
    };
    setActiveTaskId(null);
    setElapsed(0);
    startTimeRef.current = null;
    intervalRef.current = null;
    return result;
  }, [activeTaskId, elapsed]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { activeTaskId, elapsed, start, stop };
}

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function OpsTasks() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // UI state
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "all">("all");
  const [filterClient, setFilterClient] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [sortField, setSortField] = useState<"priority" | "due_date" | "created_at" | "manual">("manual");

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task & { clients: { name: string } | null } | null>(null);

  // Timer
  const timer = useTaskTimer();

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
        assigned_to: form.assigned_to || null,
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

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      for (const u of updates) {
        const { error } = await supabase.from("tasks").update({ sort_order: u.sort_order }).eq("id", u.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ops-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  // Bulk mutations
  const bulkStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: TaskStatus }) => {
      for (const id of ids) {
        const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => {
      toast.success(`${vars.ids.length} task(s) moved to ${STATUS_CONFIG[vars.status].label}`);
      queryClient.invalidateQueries({ queryKey: ["ops-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setSelected(new Set());
    },
    onError: () => toast.error("Bulk update failed"),
  });

  const bulkPriorityMutation = useMutation({
    mutationFn: async ({ ids, priority }: { ids: string[]; priority: TaskPriority }) => {
      for (const id of ids) {
        const { error } = await supabase.from("tasks").update({ priority }).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => {
      toast.success(`${vars.ids.length} task(s) set to ${PRIORITY_CONFIG[vars.priority].label}`);
      queryClient.invalidateQueries({ queryKey: ["ops-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setSelected(new Set());
    },
    onError: () => toast.error("Bulk update failed"),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        const { error } = await supabase.from("tasks").delete().eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: (_data, ids) => {
      toast.success(`${ids.length} task(s) deleted`);
      queryClient.invalidateQueries({ queryKey: ["ops-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setSelected(new Set());
      setBulkDeleteOpen(false);
    },
    onError: () => toast.error("Bulk delete failed"),
  });

  // Timer mutation - save time entry
  const saveTimerMutation = useMutation({
    mutationFn: async (entry: { taskId: string; startTime: Date; endTime: Date; hours: number; description: string }) => {
      const { error } = await supabase.from("time_entries").insert({
        user_id: user!.id,
        start_time: entry.startTime.toTimeString().slice(0, 5),
        end_time: entry.endTime.toTimeString().slice(0, 5),
        hours: entry.hours,
        description: entry.description,
        category: "client_work",
        entry_date: entry.startTime.toISOString().split("T")[0],
        day_of_week: entry.startTime.toLocaleDateString("en-US", { weekday: "long" }),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Time entry saved to timesheet");
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
    },
    onError: () => toast.error("Failed to save time entry"),
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
      assigned_to: task.assigned_to ?? "",
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditId(null);
    setForm(emptyForm);
  };

  const handleTimerToggle = (task: Task) => {
    if (timer.activeTaskId === task.id) {
      // Stop timer and save entry
      const result = timer.stop();
      if (result.startTime && result.elapsed > 10) {
        const hours = Math.round((result.elapsed / 3600) * 100) / 100;
        saveTimerMutation.mutate({
          taskId: task.id,
          startTime: result.startTime,
          endTime: result.endTime,
          hours: Math.max(hours, 0.01),
          description: task.title,
        });
      } else {
        toast.info("Timer too short — not logged");
      }
    } else {
      timer.start(task.id);
      toast.info(`Timer started for "${task.title}"`);
    }
  };

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (filteredIds: string[]) => {
    if (filteredIds.every((id) => selected.has(id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredIds));
    }
  };

  // Filtering & sorting
  const filtered = tasks
    .filter((t) => {
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterClient !== "all" && (t.client_id ?? "none") !== filterClient) return false;
      if (filterAssignee !== "all" && (t.assigned_to ?? "unassigned") !== filterAssignee) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
          !(t.description ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortField === "manual") return a.sort_order - b.sort_order;
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

  const filteredIds = filtered.map((t) => t.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const countByStatus = (s: TaskStatus) => tasks.filter((t) => t.status === s).length;

  const isDragEnabled = sortField === "manual" && filterStatus === "all" && filterPriority === "all" && filterClient === "all" && filterAssignee === "all" && !search && !someSelected;

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || !isDragEnabled) return;
    const srcIdx = result.source.index;
    const destIdx = result.destination.index;
    if (srcIdx === destIdx) return;

    const reordered = [...filtered];
    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(destIdx, 0, moved);

    const updates = reordered.map((t, i) => ({ id: t.id, sort_order: i }));
    reorderMutation.mutate(updates);
    queryClient.setQueryData(["ops-tasks"], reordered.map((t, i) => ({ ...t, sort_order: i })));
  };

  // Get unique clients and assignees from tasks for filters
  const taskClients = Array.from(new Set(tasks.map((t) => t.client_id).filter(Boolean))) as string[];
  const taskAssignees = Array.from(new Set(tasks.map((t) => t.assigned_to).filter(Boolean))) as string[];

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
        <div className="flex items-center gap-2">
          {/* Active timer indicator */}
          {timer.activeTaskId && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 animate-pulse">
              <Timer className="h-4 w-4 text-primary" />
              <span className="text-sm font-mono font-medium text-primary">{formatTimer(timer.elapsed)}</span>
            </div>
          )}
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> New Task
          </Button>
        </div>
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

      {/* Bulk actions bar */}
      {someSelected && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-3 flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <div className="h-4 w-px bg-border" />

              {/* Bulk status */}
              <Select onValueChange={(v) => bulkStatusMutation.mutate({ ids: Array.from(selected), status: v as TaskStatus })}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Set status…" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Bulk priority */}
              <Select onValueChange={(v) => bulkPriorityMutation.mutate({ ids: Array.from(selected), priority: v as TaskPriority })}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Set priority…" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="destructive"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>

              <Button variant="ghost" size="sm" className="h-8 text-xs ml-auto" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

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

              <Select value={filterClient} onValueChange={setFilterClient}>
                <SelectTrigger className="w-[140px]">
                  <Building2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  <SelectItem value="none">No Client</SelectItem>
                  {clients.filter((c) => taskClients.includes(c.id)).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                <SelectTrigger className="w-[140px]">
                  <Users className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assignees</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {teamMembers.filter((m) => taskAssignees.includes(m.id)).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortField} onValueChange={(v) => setSortField(v as typeof sortField)}>
                <SelectTrigger className="w-[150px]">
                  <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Sort: Manual</SelectItem>
                  <SelectItem value="priority">Sort: Priority</SelectItem>
                  <SelectItem value="due_date">Sort: Due Date</SelectItem>
                  <SelectItem value="created_at">Sort: Newest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isDragEnabled && (
              <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                <GripVertical className="h-3 w-3" /> Drag rows to reorder. Filters disabled while dragging.
              </p>
            )}
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
              <DragDropContext onDragEnd={handleDragEnd}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 px-2">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={() => toggleSelectAll(filteredIds)}
                          aria-label="Select all"
                        />
                      </TableHead>
                      {isDragEnabled && <TableHead className="w-10" />}
                      <TableHead className="w-[35%]">Task</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead className="hidden md:table-cell">Client</TableHead>
                      <TableHead className="hidden lg:table-cell">Due Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <Droppable droppableId="task-table">
                    {(provided) => (
                      <TableBody ref={provided.innerRef} {...provided.droppableProps}>
                        {filtered.map((task, index) => {
                          const statusCfg = STATUS_CONFIG[task.status];
                          const priorityCfg = PRIORITY_CONFIG[task.priority];
                          const clientName = (task.clients as { name: string } | null)?.name;
                          const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "done";
                          const isTimerActive = timer.activeTaskId === task.id;

                          return (
                            <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={!isDragEnabled}>
                              {(provided, snapshot) => (
                                <TableRow
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={`hover:bg-muted/30 transition-colors group cursor-pointer ${
                                    snapshot.isDragging ? "bg-accent shadow-lg" : ""
                                  } ${isOverdue ? "border-l-2 border-l-destructive" : ""} ${
                                    isTimerActive ? "bg-primary/5 border-l-2 border-l-primary" : ""
                                  } ${selected.has(task.id) ? "bg-primary/10" : ""}`}
                                  onClick={() => setSelectedTask(task as any)}
                                >
                                  <TableCell className="w-10 px-2" onClick={(e) => e.stopPropagation()}>
                                    <Checkbox
                                      checked={selected.has(task.id)}
                                      onCheckedChange={() => toggleSelect(task.id)}
                                      aria-label={`Select ${task.title}`}
                                    />
                                  </TableCell>
                                  {isDragEnabled && (
                                    <TableCell className="w-10 px-2">
                                      <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing opacity-30 hover:opacity-100 transition-opacity">
                                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                                      </div>
                                    </TableCell>
                                  )}
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1">
                                        <p className={`font-medium text-sm ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
                                        {task.description && (
                                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                                        )}
                                      </div>
                                      {isTimerActive && (
                                        <span className="text-xs font-mono text-primary font-medium animate-pulse">
                                          {formatTimer(timer.elapsed)}
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell onClick={(e) => e.stopPropagation()}>
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
                                    <div className="flex gap-1 justify-end items-center">
                                      {/* Timer button - always visible */}
                                      <Button
                                        variant={isTimerActive ? "default" : "ghost"}
                                        size="icon"
                                        className={`h-7 w-7 ${isTimerActive ? "bg-primary text-primary-foreground" : "opacity-0 group-hover:opacity-100"} transition-opacity`}
                                        onClick={(e) => { e.stopPropagation(); handleTimerToggle(task); }}
                                        title={isTimerActive ? "Stop timer" : "Start timer"}
                                      >
                                        {isTimerActive ? <Square className="h-3 w-3" /> : <Play className="h-3.5 w-3.5" />}
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); openEdit(task); }}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: task.id, title: task.title }); }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </TableBody>
                    )}
                  </Droppable>
                </Table>
              </DragDropContext>
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
                <Label>Assign To</Label>
                <Select value={form.assigned_to || "none"} onValueChange={(v) => setForm({ ...form, assigned_to: v === "none" ? "" : v })}>
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

            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
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

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} task(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected tasks. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => bulkDeleteMutation.mutate(Array.from(selected))}
            >
              {bulkDeleteMutation.isPending ? "Deleting…" : `Delete ${selected.size} Tasks`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Task Detail Dialog */}
      <TaskDetailDialog task={selectedTask} open={!!selectedTask} onClose={() => setSelectedTask(null)} />
    </div>
  );
}
