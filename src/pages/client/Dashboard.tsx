import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderKanban, Upload, MessageSquare, CheckCircle } from "lucide-react";

export default function ClientDashboard() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome to Vektiss</h1>
        <p className="text-muted-foreground">Track your project progress, upload assets, and communicate with your team.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <FolderKanban className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm font-medium">Project Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">View your project phases, timelines, and deliverables.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <Upload className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm font-medium">Asset Uploads</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Upload logos, content, and documents for your project.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm font-medium">Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Communicate directly with your project team.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <CheckCircle className="h-5 w-5 text-success" />
            <CardTitle className="text-sm font-medium">Getting Started</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Complete your onboarding steps to kick off your project.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
