import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock3, Play, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatTaskTimer, useTaskTimer } from "@/hooks/useTaskTimer";

export function OpsTaskTimer() {
  const timer = useTaskTimer();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");

  const { data: clients = [] } = useQuery({
    queryKey: ["ops-timer-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["ops-timer-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, name, client_id").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["ops-timer-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, client_id, project_id")
        .is("archived_at", null)
        .neq("status", "done")
        .order("title");
      if (error) throw error;
      return data;
    },
  });

  const availableProjects = useMemo(
    () => projects.filter((project) => !clientId || project.client_id === clientId),
    [clientId, projects],
  );
  const availableTasks = useMemo(
    () => tasks.filter((task) => {
      if (projectId) return task.project_id === projectId;
      if (clientId) return task.client_id === clientId;
      return true;
    }),
    [clientId, projectId, tasks],
  );

  const startSelectedTask = () => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    if (timer.start(task)) {
      setOpen(false);
      setTaskId("");
    }
  };

  if (timer.activeTimer) {
    return (
      <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 p-1 pl-2">
        <span className="hidden max-w-36 truncate text-xs font-medium lg:inline">{timer.activeTimer.title}</span>
        <span className="min-w-12 text-center font-mono text-xs font-semibold text-primary sm:text-sm">
          {formatTaskTimer(timer.elapsed)}
        </span>
        <Button
          size="sm"
          className="h-8 gap-1.5 px-2.5"
          onClick={() => void timer.stop()}
          disabled={timer.isSaving}
        >
          <Square className="h-3 w-3 fill-current" />
          <span className="hidden sm:inline">Stop</span>
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" className="h-9 gap-1.5 px-2.5" onClick={() => setOpen(true)}>
        <Play className="h-3.5 w-3.5 fill-current text-primary" />
        <span className="hidden sm:inline">Start Timer</span>
        <Clock3 className="h-4 w-4 sm:hidden" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start Task Timer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={clientId || "all"} onValueChange={(value) => {
                const nextClientId = value === "all" ? "" : value;
                setClientId(nextClientId);
                setProjectId("");
                setTaskId("");
              }}>
                <SelectTrigger><SelectValue placeholder="All clients" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All clients and internal work</SelectItem>
                  {clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={projectId || "all"} onValueChange={(value) => {
                setProjectId(value === "all" ? "" : value);
                setTaskId("");
              }}>
                <SelectTrigger><SelectValue placeholder="All projects" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All projects</SelectItem>
                  {availableProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Task *</Label>
              <Select value={taskId} onValueChange={setTaskId}>
                <SelectTrigger><SelectValue placeholder="Choose the task you are starting" /></SelectTrigger>
                <SelectContent>
                  {availableTasks.map((task) => <SelectItem key={task.id} value={task.id}>{task.title}</SelectItem>)}
                </SelectContent>
              </Select>
              {availableTasks.length === 0 && (
                <p className="text-xs text-muted-foreground">No open tasks match this client and project.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={startSelectedTask} disabled={!taskId} className="gap-2">
              <Play className="h-4 w-4 fill-current" /> Start Timer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
