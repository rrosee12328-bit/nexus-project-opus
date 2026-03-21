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
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { format, formatDistanceToNow } from "date-fns";

import { PHASE_LABELS, PHASE_ICONS } from "@/lib/phaseConfig";

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
  const displayName = profile?.display_name || user?.email?.split("@")[0] || "there";

  // Find next milestone - nearest target_date among active projects
  const nextMilestone = activeProjects
    .filter((p) => p.target_date)
    .sort((a, b) => new Date(a.target_date!).getTime() - new Date(b.target_date!).getTime())[0];

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="space-y-8">
      {/* Hero greeting */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-card to-card p-8"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-muted-foreground text-sm mb-1">{greeting},</p>
            <h1 className="text-3xl font-bold tracking-tight">{displayName}</h1>
            <p className="text-muted-foreground mt-2 max-w-md">
              Welcome to your creative portal. Track projects, share assets, and stay connected with your Vektiss team.
            </p>
            {nextMilestone && (
              <div className="mt-4 flex items-center gap-2 text-sm">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">Next milestone:</span>
                <span className="font-medium">{nextMilestone.name}</span>
                <span className="text-muted-foreground">—</span>
                <span className="text-primary font-mono text-xs">
                  {format(new Date(nextMilestone.target_date!), "MMM d, yyyy")}
                </span>
              </div>
            )}
          </div>
          <div className="hidden md:flex">
            <Sparkles className="h-12 w-12 text-primary/20" />
          </div>
        </div>
      </motion.div>

      {/* Onboarding checklist */}
      <OnboardingChecklist />

      {/* Status summary bar */}
      {(pendingApprovals.length > 0 || unreadCount > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="flex flex-wrap gap-3"
        >
          {pendingApprovals.length > 0 && (
            <button
              onClick={() => navigate("/portal/approvals")}
              className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-sm hover:bg-amber-500/10 transition-colors"
            >
              <FileCheck className="h-4 w-4 text-amber-500" />
              <span className="font-medium">{pendingApprovals.length} approval{pendingApprovals.length !== 1 ? "s" : ""} pending</span>
            </button>
          )}
          {unreadCount > 0 && (
            <button
              onClick={() => navigate("/portal/messages")}
              className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm hover:bg-primary/10 transition-colors"
            >
              <MessageSquare className="h-4 w-4 text-primary" />
              <span className="font-medium">{unreadCount} unread message{unreadCount !== 1 ? "s" : ""}</span>
            </button>
          )}
        </motion.div>
      )}

      {/* Quick action cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: FolderKanban, label: "Projects", sub: `${activeProjects.length} active · ${completedProjects.length} completed`, path: "/portal/projects", badge: 0 },
          { icon: FileCheck, label: "Approvals", sub: "Review deliverables", path: "/portal/approvals", badge: pendingApprovals.length },
          { icon: Upload, label: "Assets", sub: "Upload files & deliverables", path: "/portal/assets", badge: 0 },
          { icon: MessageSquare, label: "Messages", sub: "Talk to your team", path: "/portal/messages", badge: unreadCount },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 + i * 0.07 }}
          >
            <Card
              className="group cursor-pointer border-border hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
              onClick={() => navigate(item.path)}
            >
              <CardContent className="pt-6 flex flex-col items-center text-center gap-3 relative">
                {item.badge > 0 && (
                  <Badge className="absolute top-3 right-3 h-5 min-w-[20px] px-1.5 text-[10px] font-mono bg-primary text-primary-foreground">
                    {item.badge > 99 ? "99+" : item.badge}
                  </Badge>
                )}
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Active Projects
            </h2>
            <Button variant="ghost" size="sm" onClick={() => navigate("/portal/projects")} className="text-muted-foreground">
              View all <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {activeProjects.slice(0, 4).map((project, i) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.5 + i * 0.07 }}
              >
                <Card
                  className="cursor-pointer hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
                  onClick={() => navigate("/portal/projects")}
                >
                  <CardContent className="pt-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{project.name}</h3>
                        {project.description && (
                          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{project.description}</p>
                        )}
                      </div>
                      <Badge variant="secondary" className="shrink-0 gap-1">
                        <span>{PHASE_ICONS[project.current_phase] ?? "📋"}</span>
                        {PHASE_LABELS[project.current_phase]}
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-mono font-semibold text-primary">{project.progress}%</span>
                      </div>
                      <Progress value={project.progress} className="h-2" />
                    </div>

                    {project.target_date && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Rocket className="h-3 w-3" />
                        Target launch: {new Date(project.target_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Recent activity feed */}
      {recentNotifications.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="space-y-3"
        >
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Recent Activity
          </h2>
          <Card>
            <CardContent className="pt-4 pb-2 divide-y divide-border">
              {recentNotifications.map((n: any) => (
                <button
                  key={n.id}
                  className="flex items-start gap-3 w-full text-left py-3 first:pt-0 last:pb-0 hover:bg-muted/30 -mx-2 px-2 rounded-md transition-colors"
                  onClick={() => n.link && navigate(n.link)}
                >
                  <div className={`h-2 w-2 rounded-full mt-2 shrink-0 ${n.read_at ? "bg-muted-foreground/30" : "bg-primary"}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${n.read_at ? "text-muted-foreground" : "font-medium"}`}>{n.title}</p>
                    {n.body && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{n.body}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Completed projects */}
      {completedProjects.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.55 }}
          className="space-y-3"
        >
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Completed
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {completedProjects.map((project) => (
              <Card key={project.id} className="bg-card/50 border-border/50 hover:border-primary/20 transition-colors">
                <CardContent className="pt-4 pb-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-sm">{project.name}</h3>
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
      {(projects ?? []).length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
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
