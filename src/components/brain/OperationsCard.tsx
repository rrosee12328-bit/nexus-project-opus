import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderKanban, CheckCircle2, MessageSquare, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

const PHASE_ICONS: Record<string, string> = {
  discovery: "🔍", design: "🎨", development: "⚙️", review: "👀", launch: "🚀",
};
const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-destructive/20 text-destructive border-destructive/30",
  high: "bg-warning/20 text-warning border-warning/30",
  medium: "bg-primary/20 text-primary border-primary/30",
  low: "bg-muted text-muted-foreground border-border",
};

export function OperationsCard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"projects" | "tasks" | "messages">("projects");

  const { data: projects } = useQuery({
    queryKey: ["brainhub-active-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, current_phase, progress, status, clients(name)")
        .eq("status", "in_progress")
        .order("updated_at", { ascending: false })
        .limit(4);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: tasks } = useQuery({
    queryKey: ["brainhub-pending-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, status, priority, clients(name)")
        .in("status", ["todo", "in_progress"])
        .order("priority")
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["brainhub-recent-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, content, created_at, clients(name)")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-primary" />
            Operations
          </CardTitle>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="projects" className="text-xs">
                Projects
                {projects && projects.length > 0 && (
                  <Badge variant="outline" className="ml-1.5 text-[10px] font-mono">{projects.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="tasks" className="text-xs">
                Tasks
                {tasks && tasks.length > 0 && (
                  <Badge variant="outline" className="ml-1.5 text-[10px] font-mono">{tasks.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="messages" className="text-xs">Messages</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {tab === "projects" && (
          <>
            {(projects ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No active projects</p>
            ) : (
              (projects ?? []).map((p: any) => (
                <div
                  key={p.id}
                  onClick={() => navigate("/admin/projects")}
                  className="rounded-md border border-border p-3 hover:border-primary/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.clients?.name ?? "Unknown"}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0 gap-1">
                      {PHASE_ICONS[p.current_phase] ?? "📋"} {p.current_phase}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={p.progress ?? 0} className="h-1.5 flex-1" />
                    <span className="text-xs font-mono text-muted-foreground">{p.progress ?? 0}%</span>
                  </div>
                </div>
              ))
            )}
            <Button asChild variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
              <Link to="/admin/projects">View all projects <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </>
        )}

        {tab === "tasks" && (
          <>
            {(tasks ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">All caught up!</p>
            ) : (
              (tasks ?? []).map((t: any) => (
                <div key={t.id} className="flex items-center gap-3 rounded-md border border-border p-3">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${
                    t.priority === "urgent" ? "bg-destructive" :
                    t.priority === "high" ? "bg-warning" : "bg-primary"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {t.clients?.name && <span className="text-xs text-muted-foreground">{t.clients.name}</span>}
                      <Badge variant="outline" className={`text-[10px] ${PRIORITY_COLORS[t.priority] ?? ""}`}>{t.priority}</Badge>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {t.status === "in_progress" ? "In Progress" : "To Do"}
                  </Badge>
                </div>
              ))
            )}
            <Button asChild variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
              <Link to="/ops/tasks">View all tasks <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </>
        )}

        {tab === "messages" && (
          <>
            {(messages ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No messages yet</p>
            ) : (
              (messages ?? []).map((m: any) => {
                const name = m.clients?.name ?? "Unknown";
                return (
                  <div
                    key={m.id}
                    onClick={() => navigate("/admin/messages")}
                    className="flex items-start gap-3 rounded-md border border-border p-3 hover:border-primary/30 transition-colors cursor-pointer"
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-semibold text-primary">{name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{name}</p>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{m.content}</p>
                    </div>
                  </div>
                );
              })
            )}
            <Button asChild variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
              <Link to="/admin/messages">View all messages <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}