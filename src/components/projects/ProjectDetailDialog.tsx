import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  Circle,
  Clock,
  Pause,
  Calendar,
  Target,
  Activity,
  FileText,
  MessageSquarePlus,
  Loader2,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const PHASE_LABELS: Record<string, string> = {
  discovery: "Discovery",
  design: "Design",
  development: "Development",
  review: "Review",
  launch: "Launch",
};

const PHASE_DESCRIPTIONS: Record<string, string> = {
  discovery: "Understanding goals, audience, and brand identity",
  design: "Creating visual concepts and layouts",
  development: "Building and implementing the final product",
  review: "Fine-tuning details based on feedback",
  launch: "Final QA and going live",
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  on_hold: "On Hold",
};

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/10 text-primary border-primary/30",
  completed: "bg-success/15 text-success border-success/30",
  on_hold: "bg-warning/15 text-warning border-warning/30",
};

const phaseIcon = (status: string) => {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-5 w-5 text-success" />;
    case "in_progress":
      return (
        <div className="relative">
          <Clock className="h-5 w-5 text-primary" />
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
        </div>
      );
    case "on_hold":
      return <Pause className="h-5 w-5 text-warning" />;
    default:
      return <Circle className="h-5 w-5 text-muted-foreground/30" />;
  }
};

interface ProjectDetailDialogProps {
  projectId: string | null;
  onClose: () => void;
}

export default function ProjectDetailDialog({ projectId, onClose }: ProjectDetailDialogProps) {
  const queryClient = useQueryClient();
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const saveNoteMutation = useMutation({
    mutationFn: async (args: { id: string; notes: string }) => {
      const { error } = await supabase
        .from("project_phases")
        .update({ notes: args.notes || null })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-detail", projectId] });
      queryClient.invalidateQueries({ queryKey: ["admin-projects"] });
      setEditingPhaseId(null);
      toast.success("Note saved");
    },
    onError: () => toast.error("Failed to save note"),
  });

  const { data: project } = useQuery({
    queryKey: ["project-detail", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, clients(name), project_phases(*)")
        .eq("id", projectId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  if (!project) return null;

  const phases = (project.project_phases as Array<{
    id: string; phase: string; status: string; sort_order: number;
    started_at: string | null; completed_at: string | null; notes: string | null;
  }>) ?? [];
  const sortedPhases = [...phases].sort((a, b) => a.sort_order - b.sort_order);
  const completedPhases = sortedPhases.filter((p) => p.status === "completed").length;
  const badge = STATUS_COLORS[project.status] ?? STATUS_COLORS.not_started;

  // Find the most recent activity across phases
  const allDates = sortedPhases
    .flatMap((p) => [p.started_at, p.completed_at])
    .filter(Boolean) as string[];
  const lastActivityDate = allDates.length
    ? allDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
    : project.updated_at;

  const lastActivePhase = [...sortedPhases]
    .filter((p) => p.status === "in_progress" || p.status === "completed")
    .sort((a, b) => {
      const dateA = a.completed_at || a.started_at || "";
      const dateB = b.completed_at || b.started_at || "";
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    })[0];

  return (
    <Dialog open={!!projectId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-6">
            <div>
              <DialogTitle className="text-xl">{project.name}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {(project.clients as any)?.name}
              </p>
            </div>
            <Badge variant="outline" className={badge}>
              {STATUS_LABELS[project.status]}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Description */}
          {project.description && (
            <div className="flex gap-3">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground leading-relaxed">{project.description}</p>
            </div>
          )}

          {/* Last Activity */}
          <div className="rounded-lg bg-muted/40 border border-border p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Last Activity</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {lastActivePhase
                ? `${PHASE_LABELS[lastActivePhase.phase]} phase ${lastActivePhase.status === "completed" ? "completed" : "started"}`
                : "Project created"}
              {" · "}
              <span className="text-foreground font-medium">
                {formatDistanceToNow(new Date(lastActivityDate), { addSuffix: true })}
              </span>
            </p>
            {lastActivePhase?.notes && (
              <p className="text-xs mt-2 p-2 rounded-md bg-primary/5 border border-primary/10">
                {lastActivePhase.notes}
              </p>
            )}
          </div>

          {/* Progress */}
          <div className="rounded-lg bg-muted/30 border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-lg font-mono font-bold text-primary">{project.progress}%</span>
            </div>
            <Progress value={project.progress} className="h-3" />
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{completedPhases}</span> of{" "}
              <span className="font-mono">{sortedPhases.length}</span> phases complete
              {project.current_phase && ` · Currently in ${PHASE_LABELS[project.current_phase]}`}
            </p>
          </div>

          {/* Phase Timeline */}
          {sortedPhases.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                Project Timeline
              </p>
              <div className="space-y-0">
                {sortedPhases.map((phase, index) => {
                  const isActive = phase.status === "in_progress";
                  const isCompleted = phase.status === "completed";

                  return (
                    <div key={phase.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`shrink-0 ${isActive ? "scale-110" : ""} transition-transform`}>
                          {phaseIcon(phase.status)}
                        </div>
                        {index < sortedPhases.length - 1 && (
                          <div className={`w-0.5 flex-1 min-h-[2rem] ${isCompleted ? "bg-success/50" : "bg-border"}`} />
                        )}
                      </div>

                      <div className={`flex-1 pb-6 ${!isActive && !isCompleted ? "opacity-50" : ""}`}>
                        <div className="flex items-center justify-between">
                          <p className={`text-sm font-semibold ${isActive ? "text-primary" : ""}`}>
                            {PHASE_LABELS[phase.phase]}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {isCompleted && phase.completed_at &&
                              new Date(phase.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            {isActive && phase.started_at &&
                              `Started ${new Date(phase.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                            {phase.status === "not_started" && "Upcoming"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {PHASE_DESCRIPTIONS[phase.phase]}
                        </p>
                        {phase.notes && editingPhaseId !== phase.id && (
                          <p className="text-xs mt-2 p-2 rounded-md bg-primary/5 border border-primary/10 text-foreground">
                            {phase.notes}
                          </p>
                        )}
                        {/* Inline note editor */}
                        {editingPhaseId === phase.id ? (
                          <div className="mt-2 space-y-2">
                            <Textarea
                              value={noteText}
                              onChange={(e) => setNoteText(e.target.value)}
                              placeholder="Add a note about this phase…"
                              rows={2}
                              className="text-xs"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                disabled={saveNoteMutation.isPending}
                                onClick={() => saveNoteMutation.mutate({ id: phase.id, notes: noteText })}
                              >
                                {saveNoteMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => setEditingPhaseId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-1.5 transition-colors"
                            onClick={() => {
                              setEditingPhaseId(phase.id);
                              setNoteText(phase.notes || "");
                            }}
                          >
                            <MessageSquarePlus className="h-3 w-3" />
                            {phase.notes ? "Edit note" : "Add note"}
                          </button>
                        )}
                        {isCompleted && phase.started_at && phase.completed_at && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Duration: {Math.ceil((new Date(phase.completed_at).getTime() - new Date(phase.started_at).getTime()) / (1000 * 60 * 60 * 24))} days
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dates */}
          {(project.start_date || project.target_date) && (
            <>
              <Separator />
              <div className="flex gap-8">
                {project.start_date && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Started {new Date(project.start_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
                  </div>
                )}
                {project.target_date && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Target className="h-4 w-4" />
                    <span>Target {new Date(project.target_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
