import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  FolderKanban,
  DollarSign,
  TrendingUp,
  ArrowRight,
  MessageSquare,
  Upload,
  CheckCircle2,
  Clock,
  AlertCircle,
  Activity,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(val);
}

const STATUS_COLORS: Record<string, string> = {
  in_progress: "bg-primary/20 text-primary border-primary/30",
  completed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  not_started: "bg-muted text-muted-foreground border-border",
  on_hold: "bg-warning/20 text-warning border-warning/30",
};

const PHASE_ICONS: Record<string, string> = {
  discovery: "🔍",
  design: "🎨",
  development: "⚙️",
  review: "👀",
  launch: "🚀",
};

export default function AdminDashboard() {
  const navigate = useNavigate();

  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["client-payments-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_payments").select("amount");
      if (error) throw error;
      return data;
    },
  });

  const { data: projects } = useQuery({
    queryKey: ["admin-dashboard-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, clients(name)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: recentMessages } = useQuery({
    queryKey: ["admin-dashboard-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*, clients(name)")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  const { data: tasks } = useQuery({
    queryKey: ["admin-dashboard-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, clients(name)")
        .in("status", ["todo", "in_progress"])
        .order("priority")
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  const activeClients = clients?.filter((c) => c.status === "active").length ?? 0;
  const totalClients = clients?.length ?? 0;
  const mrr = (clients ?? [])
    .filter((c) => c.status === "active")
    .reduce((s, c) => s + (c.monthly_fee ?? 0), 0);
  const ytdRevenue = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);

  const activeProjects = (projects ?? []).filter((p) => p.status === "in_progress");
  const pendingSetup = (clients ?? []).reduce((s, c) => s + (c.balance_due ?? 0), 0);

  const stats = [
    { label: "Active Clients", value: activeClients, icon: Users, color: "text-primary" },
    { label: "Active Projects", value: activeProjects.length, icon: FolderKanban, color: "text-primary" },
    { label: "Monthly Recurring", value: formatCurrency(mrr), icon: DollarSign, color: "text-emerald-400" },
    { label: "YTD Revenue", value: formatCurrency(ytdRevenue), icon: TrendingUp, color: "text-emerald-400" },
  ];

  const PRIORITY_COLORS: Record<string, string> = {
    urgent: "bg-destructive/20 text-destructive border-destructive/30",
    high: "bg-warning/20 text-warning border-warning/30",
    medium: "bg-primary/20 text-primary border-primary/30",
    low: "bg-muted text-muted-foreground border-border",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your agency operations.</p>
      </motion.div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.07 }}
          >
            <Card className="group hover:border-primary/20 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">{s.value}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Active Projects */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-primary" />
              Active Projects
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin/projects")} className="text-muted-foreground">
              View all <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="flex-1 space-y-3">
            {activeProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No active projects</p>
            ) : (
              activeProjects.slice(0, 4).map((project) => {
                const clientName = (project.clients as { name: string } | null)?.name ?? "Unknown";
                return (
                  <div
                    key={project.id}
                    className="rounded-lg border border-border p-3 hover:border-primary/20 transition-colors cursor-pointer"
                    onClick={() => navigate("/admin/projects")}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{project.name}</p>
                        <p className="text-xs text-muted-foreground">{clientName}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0 gap-1">
                        {PHASE_ICONS[project.current_phase] ?? "📋"} {project.current_phase}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={project.progress} className="h-1.5 flex-1" />
                      <span className="text-xs font-mono text-muted-foreground">{project.progress}%</span>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
        </motion.div>

        {/* Pending Tasks */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Pending Tasks
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/ops/tasks")} className="text-muted-foreground">
              View all <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="flex-1 space-y-2">
            {(tasks ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">All caught up!</p>
            ) : (
              (tasks ?? []).map((task) => {
                const clientName = (task.clients as { name: string } | null)?.name;
                return (
                  <div key={task.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${
                      task.priority === "urgent" ? "bg-destructive" :
                      task.priority === "high" ? "bg-warning" :
                      "bg-primary"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {clientName && (
                          <span className="text-xs text-muted-foreground">{clientName}</span>
                        )}
                        <Badge variant="outline" className={`text-[10px] ${PRIORITY_COLORS[task.priority]}`}>
                          {task.priority}
                        </Badge>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {task.status === "in_progress" ? "In Progress" : "To Do"}
                    </Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
        </motion.div>

        {/* Recent Messages */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Recent Messages
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin/messages")} className="text-muted-foreground">
              View all <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="flex-1 space-y-2">
            {(recentMessages ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No messages yet</p>
            ) : (
              (recentMessages ?? []).map((msg) => {
                const clientName = (msg.clients as { name: string } | null)?.name ?? "Unknown";
                return (
                  <div
                    key={msg.id}
                    className="flex items-start gap-3 rounded-lg border border-border p-3 hover:border-primary/20 transition-colors cursor-pointer"
                    onClick={() => navigate("/admin/messages")}
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-semibold text-primary">{clientName.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{clientName}</p>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{msg.content}</p>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
        </motion.div>

        {/* Quick Actions & Alerts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 space-y-3">
            {/* Quick action buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-auto py-3 flex flex-col items-center gap-1.5 hover:border-primary/30 hover:bg-primary/5"
                onClick={() => navigate("/admin/clients")}
              >
                <Users className="h-4 w-4 text-primary" />
                <span className="text-xs">Manage Clients</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-3 flex flex-col items-center gap-1.5 hover:border-primary/30 hover:bg-primary/5"
                onClick={() => navigate("/admin/assets")}
              >
                <Upload className="h-4 w-4 text-primary" />
                <span className="text-xs">Upload Assets</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-3 flex flex-col items-center gap-1.5 hover:border-primary/30 hover:bg-primary/5"
                onClick={() => navigate("/admin/financials")}
              >
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="text-xs">Financials</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-3 flex flex-col items-center gap-1.5 hover:border-primary/30 hover:bg-primary/5"
                onClick={() => navigate("/admin/messages")}
              >
                <MessageSquare className="h-4 w-4 text-primary" />
                <span className="text-xs">Messages</span>
              </Button>
            </div>

            {/* Alerts section */}
            {pendingSetup > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Pending Setup Payments</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatCurrency(pendingSetup)} in outstanding setup fees
                  </p>
                </div>
              </div>
            )}

            {/* Client breakdown */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client Breakdown</p>
              {["active", "onboarding", "prospect", "lead"].map((status) => {
                const count = (clients ?? []).filter((c) => c.status === status).length;
                if (count === 0) return null;
                return (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-muted-foreground">{status}</span>
                    <span className="font-mono font-medium">{count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        </motion.div>
      </div>
    </div>
  );
}
