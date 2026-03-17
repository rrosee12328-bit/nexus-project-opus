import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Circle, Clock, Pause, Calendar, Target } from "lucide-react";

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

const statusBadgeVariant = (status: string) => {
  switch (status) {
    case "completed": return "default" as const;
    case "in_progress": return "secondary" as const;
    case "on_hold": return "outline" as const;
    default: return "outline" as const;
  }
};

const phaseIcon = (status: string) => {
  switch (status) {
    case "completed": return <CheckCircle className="h-5 w-5 text-emerald-500" />;
    case "in_progress": return <Clock className="h-5 w-5 text-primary animate-pulse" />;
    case "on_hold": return <Pause className="h-5 w-5 text-warning" />;
    default: return <Circle className="h-5 w-5 text-muted-foreground/40" />;
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your Projects</h1>
        <p className="text-muted-foreground">Track progress across all your active projects.</p>
      </div>

      {(projects ?? []).length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">No projects yet. Your team will set up your project soon!</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {(projects ?? []).map((project) => {
            const phases = (project.project_phases as Array<{ id: string; phase: string; status: string; sort_order: number; started_at: string | null; completed_at: string | null }>) ?? [];
            const sortedPhases = [...phases].sort((a, b) => a.sort_order - b.sort_order);
            const completedPhases = sortedPhases.filter((p) => p.status === "completed").length;

            return (
              <Card key={project.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{project.name}</CardTitle>
                      {project.description && (
                        <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
                      )}
                    </div>
                    <Badge variant={statusBadgeVariant(project.status)}>
                      {STATUS_LABELS[project.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Progress bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Overall Progress</span>
                      <span className="font-mono font-semibold">{project.progress}%</span>
                    </div>
                    <Progress value={project.progress} className="h-3" />
                    <p className="text-xs text-muted-foreground">
                      {completedPhases} of {sortedPhases.length} phases complete · Currently in {PHASE_LABELS[project.current_phase]}
                    </p>
                  </div>

                  {/* Phase timeline */}
                  <div className="space-y-1">
                    {sortedPhases.map((phase, index) => (
                      <div key={phase.id} className="flex items-center gap-4">
                        {/* Timeline connector */}
                        <div className="flex flex-col items-center">
                          {phaseIcon(phase.status)}
                          {index < sortedPhases.length - 1 && (
                            <div className={`w-0.5 h-6 ${phase.status === "completed" ? "bg-emerald-500" : "bg-border"}`} />
                          )}
                        </div>
                        {/* Phase info */}
                        <div className="flex-1 flex items-center justify-between py-1">
                          <div>
                            <span className={`text-sm font-medium ${phase.status === "not_started" ? "text-muted-foreground" : ""}`}>
                              {PHASE_LABELS[phase.phase]}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {phase.status === "completed" && phase.completed_at && `Completed ${new Date(phase.completed_at).toLocaleDateString()}`}
                            {phase.status === "in_progress" && phase.started_at && `Started ${new Date(phase.started_at).toLocaleDateString()}`}
                            {phase.status === "not_started" && "Upcoming"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Dates */}
                  {(project.start_date || project.target_date) && (
                    <div className="flex gap-6 pt-2 border-t border-border">
                      {project.start_date && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          Started {new Date(project.start_date).toLocaleDateString()}
                        </div>
                      )}
                      {project.target_date && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Target className="h-3.5 w-3.5" />
                          Target {new Date(project.target_date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
