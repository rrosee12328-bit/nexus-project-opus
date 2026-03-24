import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AICommandCenter from "@/components/AICommandCenter";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

import { CheckCircle2, Circle, Clock, Pause, Calendar, Target, Rocket, FileCheck, ArrowRight, BarChart3, ChevronDown, ChevronUp, ListChecks } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

import { PHASE_LABELS, PHASE_DESCRIPTIONS } from "@/lib/phaseConfig";

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

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 16 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.45, delay },
});

export default function ClientProjects() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [expandedActivity, setExpandedActivity] = useState<Record<string, boolean>>({});

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

  const { data: approvals = [] } = useQuery({
    queryKey: ["client-project-approvals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approval_requests")
        .select("id, title, status, project_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  // Fetch activity logs for all projects
  const { data: activityLogs = [] } = useQuery({
    queryKey: ["client-project-activity"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_activity_log")
        .select("id, project_id, action, details, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const activityByProject = (activityLogs as any[]).reduce((acc: Record<string, any[]>, a) => {
    if (!acc[a.project_id]) acc[a.project_id] = [];
    acc[a.project_id].push(a);
    return acc;
  }, {} as Record<string, any[]>);

  const approvalsByProject = (approvals as any[]).reduce((acc: Record<string, any[]>, a) => {
    if (!acc[a.project_id]) acc[a.project_id] = [];
    acc[a.project_id].push(a);
    return acc;
  }, {} as Record<string, any[]>);

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

  const allProjects = projects ?? [];
  const activeProjects = allProjects.filter((p) => p.status === "in_progress");
  const completedProjects = allProjects.filter((p) => p.status === "completed");
  const totalPendingApprovals = (approvals as any[]).filter((a: any) => a.status === "pending").length;

  return (
    <div className="space-y-8">
      <AICommandCenter pageContext={{ pageType: "projects", title: "Your Projects" }} />
      <motion.div {...anim(0)}>
        <h1 className="text-2xl font-bold tracking-tight">Your Projects</h1>
        <p className="text-muted-foreground mt-1">Track progress across every phase of your creative projects.</p>
      </motion.div>

      {/* Summary stats */}
      {allProjects.length > 0 && (
        <motion.div {...anim(0.08)} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Projects", value: allProjects.length, icon: BarChart3, color: "text-primary" },
            { label: "In Progress", value: activeProjects.length, icon: Clock, color: "text-primary" },
            { label: "Completed", value: completedProjects.length, icon: CheckCircle2, color: "text-success" },
            { label: "Pending Reviews", value: totalPendingApprovals, icon: FileCheck, color: "text-warning" },
          ].map((stat) => (
            <Card key={stat.label} className="border-border">
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <div className={`h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0`}>
                  <stat.icon className={`h-4.5 w-4.5 ${stat.color}`} />
                </div>
                <div>
                  <p className="font-mono font-bold text-xl leading-none">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      )}

      {allProjects.length === 0 ? (
        <motion.div {...anim(0.15)}>
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
          {allProjects.map((project, idx) => {
            const phases = (project.project_phases as Array<{
              id: string; phase: string; status: string; sort_order: number;
              started_at: string | null; completed_at: string | null; notes: string | null;
            }>) ?? [];
            const sortedPhases = [...phases].sort((a, b) => a.sort_order - b.sort_order);
            const completedPhases = sortedPhases.filter((p) => p.status === "completed").length;
            const badge = STATUS_BADGES[project.status] ?? STATUS_BADGES.not_started;
            const projectApprovals = approvalsByProject[project.id] ?? [];
            const pendingApprovals = projectApprovals.filter((a: any) => a.status === "pending");

            return (
              <motion.div key={project.id} {...anim(0.12 + idx * 0.08)}>
                <Card className="overflow-hidden hover:border-primary/20 transition-all duration-300 group">
                  {/* Top progress bar */}
                  <div className="h-1 bg-muted">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-700"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>

                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <CardTitle className="text-xl group-hover:text-primary transition-colors">{project.name}</CardTitle>
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
                    {/* Progress overview with circular indicator */}
                    <div className="rounded-xl bg-muted/30 border border-border p-5">
                      <div className="flex items-center gap-5">
                        {/* Circular progress */}
                        <div className="relative h-16 w-16 shrink-0">
                          <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
                            <circle cx="18" cy="18" r="15.5" fill="none" stroke="hsl(var(--muted))" strokeWidth="2.5" />
                            <circle
                              cx="18" cy="18" r="15.5" fill="none"
                              stroke="hsl(var(--primary))"
                              strokeWidth="2.5"
                              strokeDasharray={`${project.progress * 0.9742} 97.42`}
                              strokeLinecap="round"
                              className="transition-all duration-700"
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-sm font-mono font-bold">
                            {project.progress}%
                          </span>
                        </div>

                        <div className="flex-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Overall Progress</span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {completedPhases}/{sortedPhases.length} phases
                            </span>
                          </div>
                          <Progress value={project.progress} className="h-2" />
                          {project.current_phase && (
                            <p className="text-xs text-muted-foreground">
                              Currently in <span className="text-primary font-medium">{PHASE_LABELS[project.current_phase]}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Pending approvals */}
                    {pendingApprovals.length > 0 && (
                      <button
                        onClick={() => navigate("/portal/approvals")}
                        className="w-full flex items-center gap-3 rounded-xl border border-warning/20 bg-warning/5 px-4 py-3 text-left hover:bg-warning/10 hover:border-warning/40 transition-all group/approval"
                      >
                        <div className="h-9 w-9 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
                          <FileCheck className="h-4.5 w-4.5 text-warning" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {pendingApprovals.length} deliverable{pendingApprovals.length !== 1 ? "s" : ""} awaiting your review
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {pendingApprovals.map((a: any) => a.title).join(", ")}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover/approval:translate-x-0.5 transition-transform" />
                      </button>
                    )}

                    {/* Horizontal phase stepper (for small phase counts) + vertical timeline */}
                    {sortedPhases.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Project Timeline</p>

                        {/* Horizontal stepper for desktop */}
                        <div className="hidden md:flex items-start gap-0 mb-2">
                          {sortedPhases.map((phase, index) => {
                            const isActive = phase.status === "in_progress";
                            const isCompleted = phase.status === "completed";
                            return (
                              <div key={phase.id} className="flex-1 flex flex-col items-center relative">
                                {/* Connector line */}
                                {index > 0 && (
                                  <div className={`absolute top-[10px] right-1/2 w-full h-0.5 -z-10 ${
                                    isCompleted || sortedPhases[index - 1]?.status === "completed"
                                      ? "bg-success/50"
                                      : "bg-border"
                                  }`} />
                                )}
                                <div className={`shrink-0 ${isActive ? "scale-110" : ""} transition-transform z-10 bg-card`}>
                                  {phaseIcon(phase.status)}
                                </div>
                                <p className={`text-[11px] mt-2 text-center font-medium leading-tight ${
                                  isActive ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground/50"
                                }`}>
                                  {PHASE_LABELS[phase.phase]}
                                </p>
                                {isActive && phase.started_at && (
                                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                    {new Date(phase.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  </p>
                                )}
                                {isCompleted && phase.completed_at && (
                                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                    {new Date(phase.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Vertical timeline for mobile */}
                        <div className="md:hidden space-y-0">
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
                                    <span className="text-xs text-muted-foreground font-mono">
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
                                    <p className="text-xs mt-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10 text-foreground">
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
                        <div className="flex flex-wrap gap-4 sm:gap-8">
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

                    {/* Completed Work / Activity History */}
                    {(() => {
                      const projectActivity = activityByProject[project.id] ?? [];
                      const milestones = projectActivity.filter((a: any) =>
                        ["status_change", "phase_change", "phase_status_change"].includes(a.action)
                      );
                      const taskCompletions = projectActivity.filter((a: any) => a.action === "task_completed");
                      const isExpanded = expandedActivity[project.id] ?? false;

                      if (milestones.length === 0 && taskCompletions.length === 0) return null;

                      return (
                        <>
                          <Separator />
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <ListChecks className="h-4 w-4 text-muted-foreground" />
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Completed Work</p>
                              </div>
                              {taskCompletions.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-muted-foreground"
                                  onClick={() => setExpandedActivity(prev => ({ ...prev, [project.id]: !isExpanded }))}
                                >
                                  {isExpanded ? "Hide details" : `${taskCompletions.length} task${taskCompletions.length !== 1 ? "s" : ""}`}
                                  {isExpanded ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                                </Button>
                              )}
                            </div>

                            {/* Milestones always visible */}
                            {milestones.length > 0 && (
                              <div className="space-y-2 mb-3">
                                {milestones.slice(0, 5).map((m: any) => (
                                  <div key={m.id} className="flex items-start gap-2.5 text-sm">
                                    <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                      <p className="text-foreground">{m.details}</p>
                                      <p className="text-xs text-muted-foreground font-mono">
                                        {new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Task completions - expandable */}
                            {isExpanded && taskCompletions.length > 0 && (
                              <div className="space-y-1.5 rounded-lg bg-muted/30 border border-border p-3">
                                {taskCompletions.map((t: any) => (
                                  <div key={t.id} className="flex items-center gap-2 text-xs">
                                    <div className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
                                    <span className="text-foreground flex-1">{t.details}</span>
                                    <span className="text-muted-foreground font-mono">
                                      {new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()}
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
