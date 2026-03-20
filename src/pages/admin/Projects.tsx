import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FolderKanban,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  Clock,
  Pause,
  Circle,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Constants } from "@/integrations/supabase/types";
import ProjectDetailDialog from "@/components/projects/ProjectDetailDialog";

const PHASE_LABELS: Record<string, string> = {
  discovery: "Discovery",
  design: "Design",
  development: "Development",
  review: "Review",
  launch: "Launch",
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  on_hold: "On Hold",
};

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/10 text-primary",
  completed: "bg-success/20 text-success",
  on_hold: "bg-warning/20 text-warning",
};

const STATUS_ICONS: Record<string, typeof Circle> = {
  not_started: Circle,
  in_progress: Clock,
  completed: CheckCircle2,
  on_hold: Pause,
};

type ProjectForm = {
  client_id: string;
  name: string;
  description: string;
  status: string;
  current_phase: string;
  progress: number;
  start_date: string;
  target_date: string;
};

const emptyForm: ProjectForm = {
  client_id: "",
  name: "",
  description: "",
  status: "not_started",
  current_phase: "discovery",
  progress: 0,
  start_date: "",
  target_date: "",
};

export default function AdminProjects() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [phaseDialogId, setPhaseDialogId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Fetch projects with client names
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["admin-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch clients for dropdown
  const { data: clients = [] } = useQuery({
    queryKey: ["admin-project-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, status")
        .in("status", ["active", "onboarding", "prospect"])
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch phases for phase dialog
  const { data: phases = [] } = useQuery({
    queryKey: ["admin-project-phases", phaseDialogId],
    queryFn: async () => {
      if (!phaseDialogId) return [];
      const { data, error } = await supabase
        .from("project_phases")
        .select("*")
        .eq("project_id", phaseDialogId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!phaseDialogId,
  });

  // Save project (create or update)
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        client_id: form.client_id,
        name: form.name,
        description: form.description || null,
        status: form.status as any,
        current_phase: form.current_phase as any,
        progress: form.progress,
        start_date: form.start_date || null,
        target_date: form.target_date || null,
      };

      if (editingId) {
        const { error } = await supabase.from("projects").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("projects").insert(payload).select().single();
        if (error) throw error;

        // Create default phases
        const phaseEntries = Constants.public.Enums.project_phase.map((phase, i) => ({
          project_id: data.id,
          phase: phase as any,
          sort_order: i,
          status: "not_started" as any,
        }));
        const { error: phaseError } = await supabase.from("project_phases").insert(phaseEntries);
        if (phaseError) throw phaseError;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Project updated" : "Project created");
      queryClient.invalidateQueries({ queryKey: ["admin-projects"] });
      closeForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Delete project
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Project deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-projects"] });
      setDeleteTarget(null);
    },
    onError: () => toast.error("Failed to delete project"),
  });

  // Update a single phase
  const updatePhaseMutation = useMutation({
    mutationFn: async (args: { id: string; status: string; notes?: string }) => {
      const update: any = { status: args.status };
      if (args.status === "in_progress" ) update.started_at = new Date().toISOString();
      if (args.status === "completed") update.completed_at = new Date().toISOString();
      if (args.notes !== undefined) update.notes = args.notes;
      const { error } = await supabase.from("project_phases").update(update).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-project-phases", phaseDialogId] });
      queryClient.invalidateQueries({ queryKey: ["admin-projects"] });
    },
    onError: () => toast.error("Failed to update phase"),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (project: any) => {
    setEditingId(project.id);
    setForm({
      client_id: project.client_id,
      name: project.name,
      description: project.description || "",
      status: project.status,
      current_phase: project.current_phase,
      progress: project.progress,
      start_date: project.start_date || "",
      target_date: project.target_date || "",
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const groupedByClient = projects.reduce<Record<string, any[]>>((acc, p) => {
    const clientName = (p.clients as any)?.name ?? "Unknown";
    if (!acc[clientName]) acc[clientName] = [];
    acc[clientName].push(p);
    return acc;
  }, {});

  const statItems = [
    { label: "Total", value: projects.length, color: "text-foreground" },
    { label: "In Progress", value: projects.filter((p) => p.status === "in_progress").length, color: "text-primary" },
    { label: "Completed", value: projects.filter((p) => p.status === "completed").length, color: "text-success" },
    { label: "On Hold", value: projects.filter((p) => p.status === "on_hold").length, color: "text-warning" },
  ];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Project Management</h1>
          <p className="text-muted-foreground">Create, edit, and track project phases.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> New Project
        </Button>
      </motion.div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        {statItems.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.07 }}
          >
            <Card className="hover:border-primary/20 transition-colors">
              <CardContent className="pt-4 pb-4 text-center">
                <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Projects grouped by client */}
      {Object.entries(groupedByClient).map(([clientName, clientProjects], groupIdx) => (
        <motion.div
          key={clientName}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 + groupIdx * 0.08 }}
          className="space-y-3"
        >
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{clientName}</h2>
          <div className="grid gap-3">
            {clientProjects.map((project) => {
              const StatusIcon = STATUS_ICONS[project.status] || Circle;
              return (
                <Card key={project.id} className="hover:border-primary/20 transition-colors cursor-pointer" onClick={() => setDetailId(project.id)}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      {/* Info */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold">{project.name}</h3>
                          <Badge className={`${STATUS_COLORS[project.status]} text-xs`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {STATUS_LABELS[project.status]}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {PHASE_LABELS[project.current_phase]}
                          </Badge>
                        </div>
                        {project.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{project.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {project.start_date && <span>Start: {new Date(project.start_date).toLocaleDateString()}</span>}
                          {project.target_date && <span>Target: {new Date(project.target_date).toLocaleDateString()}</span>}
                        </div>
                      </div>

                      {/* Progress */}
                      <div className="w-full sm:w-40 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="font-mono font-semibold text-primary">{project.progress}%</span>
                        </div>
                        <Progress value={project.progress} className="h-2" />
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => setPhaseDialogId(project.id)}>
                          Phases
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(project)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(project.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </motion.div>
      ))}

      {!isLoading && projects.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Card className="border-dashed border-2">
            <CardContent className="py-16 flex flex-col items-center text-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <FolderKanban className="h-8 w-8 text-primary/40" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">No projects yet</h3>
                <p className="text-sm text-muted-foreground mt-1">Create your first project to get started.</p>
              </div>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" /> New Project
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Project" : "New Project"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Project Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Website Redesign" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description…" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Constants.public.Enums.project_status.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Current Phase</Label>
                <Select value={form.current_phase} onValueChange={(v) => setForm({ ...form, current_phase: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Constants.public.Enums.project_phase.map((p) => (
                      <SelectItem key={p} value={p}>{PHASE_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Progress: <span className="font-mono">{form.progress}%</span></Label>
              <Slider
                value={[form.progress]}
                onValueChange={([v]) => setForm({ ...form, progress: v })}
                max={100}
                step={5}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Target Date</Label>
                <Input type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.client_id || !form.name || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingId ? "Save Changes" : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase Management Dialog */}
      <Dialog open={!!phaseDialogId} onOpenChange={(open) => { if (!open) setPhaseDialogId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Phases</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {phases.map((phase) => {
              const StatusIcon = STATUS_ICONS[phase.status] || Circle;
              return (
                <div key={phase.id} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:border-primary/20 transition-colors">
                  <StatusIcon className={`h-5 w-5 shrink-0 ${
                    phase.status === "completed" ? "text-success" :
                    phase.status === "in_progress" ? "text-primary" : "text-muted-foreground"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{PHASE_LABELS[phase.phase]}</p>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                      {phase.started_at && <span>Started: {new Date(phase.started_at).toLocaleDateString()}</span>}
                      {phase.completed_at && <span>Done: {new Date(phase.completed_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <Select
                    value={phase.status}
                    onValueChange={(v) => updatePhaseMutation.mutate({ id: phase.id, status: v })}
                  >
                    <SelectTrigger className="w-[130px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Constants.public.Enums.project_status.map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will permanently delete this project and all its phases. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
