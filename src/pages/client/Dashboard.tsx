import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FolderKanban,
  Upload,
  MessageSquare,
  ArrowRight,
  Rocket,
  Clock,
  CheckCircle2,
  Sparkles,
  FileCheck,
  Bell,
  Target,
  TrendingUp,
  Zap,
  CalendarDays,
  Headphones,
  Mail,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { format, formatDistanceToNow } from "date-fns";

import { PHASE_LABELS, PHASE_ICONS } from "@/lib/phaseConfig";

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 16 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.45, delay },
});

export default function ClientDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: clientId } = useQuery({
    queryKey: ["my-client-id", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase.rpc("get_client_id_for_user", { _user_id: user.id });
      if (error) throw error;
      return data as string | null;
    },
    enabled: !!user?.id,
  });

  const { data: projects } = useQuery({
    queryKey: ["client-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["client-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: pendingApprovals = [] } = useQuery({
    queryKey: ["client-pending-approvals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approval_requests")
        .select("id, title, projects(name), created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["unread-messages", clientId],
    queryFn: async () => {
      if (!clientId || !user?.id) return 0;
      const { count, error } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId)
        .neq("sender_id", user.id)
        .is("read_at", null);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!clientId && !!user?.id,
  });

  const { data: recentNotifications = [] } = useQuery({
    queryKey: ["client-recent-notifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const activeProjects = (projects ?? []).filter((p) => p.status === "in_progress");
  const completedProjects = (projects ?? []).filter((p) => p.status === "completed");
  const allProjects = projects ?? [];
  const displayName = profile?.display_name || user?.email?.split("@")[0] || "there";

  const nextMilestone = activeProjects
    .filter((p) => p.target_date)
    .sort((a, b) => new Date(a.target_date!).getTime() - new Date(b.target_date!).getTime())[0];

  const avgProgress = activeProjects.length
    ? Math.round(activeProjects.reduce((s, p) => s + p.progress, 0) / activeProjects.length)
    : 0;

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="space-y-8">
      {/* Hero greeting */}
      <motion.div {...anim(0)} className="relative overflow-hidden rounded-2xl border border-border bg-card">
        {/* Decorative gradient blobs */}
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />

        <div className="relative p-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-muted-foreground text-sm mb-1 flex items-center gap-1.5">
                {greeting}
                <Sparkles className="h-3.5 w-3.5 text-primary/40" />
              </p>
              <h1 className="text-3xl font-bold tracking-tight">{displayName}</h1>
              <p className="text-muted-foreground mt-2 max-w-lg">
                Welcome to your creative portal. Track projects, share assets, and stay connected with your Vektiss team.
              </p>
            </div>
          </div>

          {/* Inline stats strip */}
          {allProjects.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FolderKanban className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-mono font-bold text-lg leading-none">{activeProjects.length}</p>
                  <p className="text-muted-foreground text-xs">Active</p>
                </div>
              </div>
              {activeProjects.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-mono font-bold text-lg leading-none">{avgProgress}%</p>
                    <p className="text-muted-foreground text-xs">Avg Progress</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                </div>
                <div>
                  <p className="font-mono font-bold text-lg leading-none">{completedProjects.length}</p>
                  <p className="text-muted-foreground text-xs">Completed</p>
                </div>
              </div>
              {nextMilestone && (
                <div className="flex items-center gap-2 ml-auto">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Next:</span>
                  <span className="font-medium truncate max-w-[150px]">{nextMilestone.name}</span>
                  <span className="text-primary font-mono text-xs">
                    {format(new Date(nextMilestone.target_date!), "MMM d")}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* Onboarding checklist */}
      <OnboardingChecklist />

      {/* Alerts bar */}
      {(pendingApprovals.length > 0 || unreadCount > 0) && (
        <motion.div {...anim(0.1)} className="flex flex-wrap gap-3">
          {pendingApprovals.length > 0 && (
            <button
              onClick={() => navigate("/portal/approvals")}
              className="flex items-center gap-2.5 rounded-xl border border-warning/20 bg-warning/5 px-4 py-3 text-sm hover:bg-warning/10 transition-all hover:border-warning/40 group"
            >
              <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center group-hover:bg-warning/20 transition-colors">
                <FileCheck className="h-4 w-4 text-warning" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-sm">{pendingApprovals.length} approval{pendingApprovals.length !== 1 ? "s" : ""} pending</p>
                <p className="text-xs text-muted-foreground">Review deliverables</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground ml-2 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}
          {unreadCount > 0 && (
            <button
              onClick={() => navigate("/portal/messages")}
              className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm hover:bg-primary/10 transition-all hover:border-primary/40 group"
            >
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <MessageSquare className="h-4 w-4 text-primary" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-sm">{unreadCount} unread message{unreadCount !== 1 ? "s" : ""}</p>
                <p className="text-xs text-muted-foreground">View conversation</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground ml-2 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}
        </motion.div>
      )}

      {/* Quick action cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: FolderKanban, label: "Projects", sub: `${activeProjects.length} active · ${completedProjects.length} done`, path: "/portal/projects", badge: 0, accent: "primary" },
          { icon: FileCheck, label: "Approvals", sub: "Review deliverables", path: "/portal/approvals", badge: pendingApprovals.length, accent: "warning" },
          { icon: Upload, label: "Assets", sub: "Files & deliverables", path: "/portal/assets", badge: 0, accent: "primary" },
          { icon: MessageSquare, label: "Messages", sub: "Talk to your team", path: "/portal/messages", badge: unreadCount, accent: "primary" },
        ].map((item, i) => (
          <motion.div key={item.label} {...anim(0.15 + i * 0.06)}>
            <Card
              className="group cursor-pointer border-border hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 relative overflow-hidden"
              onClick={() => navigate(item.path)}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardContent className="pt-6 pb-5 flex flex-col items-center text-center gap-3 relative">
                {item.badge > 0 && (
                  <Badge className="absolute top-3 right-3 h-5 min-w-[20px] px-1.5 text-[10px] font-mono bg-primary text-primary-foreground">
                    {item.badge > 99 ? "99+" : item.badge}
                  </Badge>
                )}
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 group-hover:scale-105 transition-all duration-300">
                  <item.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.sub}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Active projects */}
      {activeProjects.length > 0 && (
        <motion.div {...anim(0.4)} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Active Projects
            </h2>
            <Button variant="ghost" size="sm" onClick={() => navigate("/portal/projects")} className="text-muted-foreground hover:text-primary">
              View all <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {activeProjects.slice(0, 4).map((project, i) => (
              <motion.div key={project.id} {...anim(0.45 + i * 0.06)}>
                <Card
                  className="group cursor-pointer border-border hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 overflow-hidden"
                  onClick={() => navigate("/portal/projects")}
                >
                  {/* Thin top accent bar showing progress */}
                  <div className="h-1 bg-muted">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>

                  <CardContent className="pt-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate group-hover:text-primary transition-colors">{project.name}</h3>
                        {project.description && (
                          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{project.description}</p>
                        )}
                      </div>
                      <Badge variant="secondary" className="shrink-0 gap-1 text-xs">
                        <span>{PHASE_ICONS[project.current_phase] ?? "📋"}</span>
                        {PHASE_LABELS[project.current_phase]}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Circular progress indicator */}
                        <div className="relative h-11 w-11">
                          <svg viewBox="0 0 36 36" className="h-11 w-11 -rotate-90">
                            <circle cx="18" cy="18" r="15.5" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                            <circle
                              cx="18" cy="18" r="15.5" fill="none"
                              stroke="hsl(var(--primary))"
                              strokeWidth="3"
                              strokeDasharray={`${project.progress * 0.9742} 97.42`}
                              strokeLinecap="round"
                              className="transition-all duration-700"
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-bold">
                            {project.progress}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Progress</p>
                          <p className="text-sm font-medium">{project.progress}% complete</p>
                        </div>
                      </div>

                      {project.target_date && (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Target</p>
                          <p className="text-sm font-mono">
                            {format(new Date(project.target_date), "MMM d")}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Recent activity feed */}
      {recentNotifications.length > 0 && (
        <motion.div {...anim(0.5)} className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Recent Activity
          </h2>
          <Card>
            <CardContent className="pt-4 pb-2 divide-y divide-border">
              {recentNotifications.map((n: any) => (
                <button
                  key={n.id}
                  className="flex items-start gap-3 w-full text-left py-3 first:pt-0 last:pb-0 hover:bg-muted/30 -mx-2 px-2 rounded-md transition-colors group"
                  onClick={() => n.link && navigate(n.link)}
                >
                  <div className={`h-2 w-2 rounded-full mt-2 shrink-0 ${n.read_at ? "bg-muted-foreground/30" : "bg-primary"}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${n.read_at ? "text-muted-foreground" : "font-medium"} group-hover:text-primary transition-colors`}>{n.title}</p>
                    {n.body && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{n.body}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Widgets row — Upcoming deadlines + Contact */}
      <motion.div {...anim(0.5)} className="grid gap-4 md:grid-cols-2">
        {/* Upcoming deadlines */}
        <Card className="border-border hover:border-primary/20 transition-colors">
          <CardContent className="pt-5 pb-5 space-y-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Upcoming Deadlines</h3>
            </div>
            {(() => {
              const upcoming = activeProjects
                .filter((p) => p.target_date && new Date(p.target_date) >= new Date())
                .sort((a, b) => new Date(a.target_date!).getTime() - new Date(b.target_date!).getTime())
                .slice(0, 4);
              if (upcoming.length === 0) {
                return <p className="text-sm text-muted-foreground">No upcoming deadlines.</p>;
              }
              return (
                <div className="space-y-3">
                  {upcoming.map((p) => {
                    const daysLeft = Math.ceil((new Date(p.target_date!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    return (
                      <div key={p.id} className="flex items-center gap-3 group">
                        <div className={`h-2 w-2 rounded-full shrink-0 ${daysLeft <= 7 ? "bg-warning" : "bg-primary"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{p.name}</p>
                        </div>
                        <span className={`text-xs font-mono shrink-0 ${daysLeft <= 7 ? "text-warning font-semibold" : "text-muted-foreground"}`}>
                          {daysLeft === 0 ? "Today" : daysLeft === 1 ? "Tomorrow" : `${daysLeft}d left`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Contact / Support card */}
        <Card className="border-border hover:border-primary/20 transition-colors">
          <CardContent className="pt-5 pb-5 space-y-4">
            <div className="flex items-center gap-2">
              <Headphones className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Your Team</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Have questions or need something? Your Vektiss creative team is here to help.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate("/portal/messages")}>
                <MessageSquare className="h-3.5 w-3.5" />
                Send Message
              </Button>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => window.location.href = "mailto:hello@vektiss.com"}>
                <Mail className="h-3.5 w-3.5" />
                hello@vektiss.com
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Completed projects */}
      {completedProjects.length > 0 && (
        <motion.div {...anim(0.55)} className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Completed
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {completedProjects.map((project) => (
              <Card key={project.id} className="bg-card/50 border-border/50 hover:border-success/20 transition-colors group">
                <CardContent className="pt-4 pb-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-sm group-hover:text-success transition-colors">{project.name}</h3>
                    {project.description && (
                      <p className="text-xs text-muted-foreground">{project.description}</p>
                    )}
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      {/* Empty state */}
      {allProjects.length === 0 && (
        <motion.div {...anim(0.3)}>
          <Card className="border-dashed border-2 border-border">
            <CardContent className="py-16 flex flex-col items-center text-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Rocket className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Your projects are being set up</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Your Vektiss team is preparing your project workspace. You'll see your projects here once they're ready.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
