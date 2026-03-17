import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, Upload, MessageSquare, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const PHASE_LABELS: Record<string, string> = {
  discovery: "Discovery",
  design: "Design",
  development: "Development",
  review: "Review",
  launch: "Launch",
};

export default function ClientDashboard() {
  const navigate = useNavigate();

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

  const activeProjects = (projects ?? []).filter((p) => p.status === "in_progress");

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome to Vektiss</h1>
        <p className="text-muted-foreground">Track your project progress, upload assets, and communicate with your team.</p>
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/portal/projects")}>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <FolderKanban className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{activeProjects.length}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/portal/assets")}>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <Upload className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm font-medium">Asset Uploads</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Upload files for your projects</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/portal/messages")}>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm font-medium">Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Chat with your team</p>
          </CardContent>
        </Card>
      </div>

      {/* Active project cards */}
      {activeProjects.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Active Projects</h2>
          {activeProjects.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => navigate("/portal/projects")}
            >
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{project.name}</h3>
                    {project.description && (
                      <p className="text-sm text-muted-foreground">{project.description}</p>
                    )}
                  </div>
                  <Badge variant="secondary">
                    {PHASE_LABELS[project.current_phase]}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <Progress value={project.progress} className="flex-1" />
                  <span className="text-sm font-mono font-medium">{project.progress}%</span>
                </div>
                {project.target_date && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Target: {new Date(project.target_date).toLocaleDateString()}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
