import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ALL_PHASE_KEYS, PHASE_LABELS, PHASE_ICONS } from "@/lib/phaseConfig";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

interface Project {
  id: string;
  name: string;
  current_phase: string;
  progress: number;
  status: string;
}

interface Props {
  projects: Project[];
}

export function ProjectRoadmapWidget({ projects }: Props) {
  const navigate = useNavigate();
  const activeProjects = projects.filter((p) => p.status === "in_progress");

  if (activeProjects.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <span className="text-primary">📍</span>
        Project Roadmap
      </h2>

      <div className="space-y-4">
        {activeProjects.map((project) => {
          const currentIndex = ALL_PHASE_KEYS.indexOf(project.current_phase);

          return (
            <Card
              key={project.id}
              className="group cursor-pointer border-border hover:border-primary/30 transition-all"
              onClick={() => navigate("/portal/projects")}
            >
              <CardContent className="pt-5 pb-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                    {project.name}
                  </h3>
                  <Badge variant="secondary" className="shrink-0 text-xs font-mono">
                    {project.progress}%
                  </Badge>
                </div>

                {/* Phase timeline */}
                <div className="flex items-center gap-0">
                  {ALL_PHASE_KEYS.map((phase, i) => {
                    const isCompleted = i < currentIndex;
                    const isCurrent = i === currentIndex;
                    const isFuture = i > currentIndex;

                    return (
                      <div key={phase} className="flex items-center flex-1 min-w-0">
                        {/* Node */}
                        <div className="flex flex-col items-center gap-1.5 relative z-10">
                          <div
                            className={`h-7 w-7 rounded-full flex items-center justify-center text-xs shrink-0 transition-all ${
                              isCompleted
                                ? "bg-primary text-primary-foreground"
                                : isCurrent
                                ? "bg-primary/15 border-2 border-primary text-primary ring-4 ring-primary/10"
                                : "bg-muted text-muted-foreground border border-border"
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : isCurrent ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <span>{PHASE_ICONS[phase]}</span>
                            )}
                          </div>
                          <span
                            className={`text-[10px] leading-tight text-center truncate max-w-[56px] ${
                              isCurrent ? "font-semibold text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"
                            }`}
                          >
                            {PHASE_LABELS[phase]}
                          </span>
                        </div>

                        {/* Connector line */}
                        {i < ALL_PHASE_KEYS.length - 1 && (
                          <div className="flex-1 h-0.5 mx-1 mt-[-18px]">
                            <div
                              className={`h-full rounded-full transition-colors ${
                                i < currentIndex ? "bg-primary" : "bg-border"
                              }`}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
