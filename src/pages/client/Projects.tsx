import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Circle, Clock, Pause, Calendar, Target, Rocket } from "lucide-react";
import { motion } from "framer-motion";

import { PHASE_LABELS, PHASE_DESCRIPTIONS } from "@/lib/phaseConfig";

const PHASE_DESCRIPTIONS: Record<string, string> = {
  discovery: "Understanding your goals, audience, and brand identity",
  design: "Creating visual concepts and layouts for your approval",
  development: "Building and implementing the final product",
  review: "Fine-tuning details based on your feedback",
  launch: "Final QA and going live",
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  not_started: { label: "Not Started", className: "bg-muted text-muted-foreground" },
  in_progress: { label: "In Progress", className: "bg-primary/15 text-primary border-primary/30" },
  completed: { label: "Completed", className: "bg-success/15 text-success border-success/30" },
  on_hold: { label: "On Hold", className: "bg-warning/15 text-warning border-warning/30" },
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

export default function ClientProjects() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ["client-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, clients(name), project_phases(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading projects…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-2xl font-bold tracking-tight">Your Projects</h1>
        <p className="text-muted-foreground mt-1">Track progress across every phase of your creative projects.</p>
      </motion.div>

      {(projects ?? []).length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card className="border-dashed border-2 border-border">
            <CardContent className="py-16 flex flex-col items-center text-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Rocket className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">No projects yet</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Your project workspace is being prepared. We'll notify you once everything is ready.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="space-y-6">
          {(projects ?? []).map((project, idx) => {
            const phases = (project.project_phases as Array<{
              id: string; phase: string; status: string; sort_order: number;
              started_at: string | null; completed_at: string | null; notes: string | null;
            }>) ?? [];
            const sortedPhases = [...phases].sort((a, b) => a.sort_order - b.sort_order);
            const completedPhases = sortedPhases.filter((p) => p.status === "completed").length;
            const badge = STATUS_BADGES[project.status] ?? STATUS_BADGES.not_started;

            return (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 + idx * 0.1 }}
              >
                <Card className="overflow-hidden hover:border-primary/20 transition-colors">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <CardTitle className="text-xl">{project.name}</CardTitle>
                        {project.description && (
                          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{project.description}</p>
                        )}
                      </div>
                      <Badge variant="outline" className={badge.className}>
                        {badge.label}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-6">
                    {/* Progress overview */}
                    <div className="rounded-xl bg-muted/30 border border-border p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Overall Progress</span>
                        <span className="text-lg font-mono font-bold text-primary">{project.progress}%</span>
                      </div>
                      <Progress value={project.progress} className="h-3" />
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{completedPhases}</span> of <span className="font-mono">{sortedPhases.length}</span> phases complete
                        {project.current_phase && ` · Currently in ${PHASE_LABELS[project.current_phase]}`}
                      </p>
                    </div>

                    {/* Phase timeline */}
                    {sortedPhases.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Project Timeline</p>
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
                                  {phase.notes && isActive && (
                                    <p className="text-xs mt-2 p-2 rounded-md bg-primary/5 border border-primary/10 text-foreground">
                                      {phase.notes}
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
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
