import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckSquare, Clock, AlertTriangle, TrendingUp } from "lucide-react";

const stats = [
  { label: "Open Tasks", value: "—", icon: CheckSquare },
  { label: "In Progress", value: "—", icon: Clock },
  { label: "Blocked", value: "—", icon: AlertTriangle },
  { label: "Completed Today", value: "—", icon: TrendingUp },
];

export default function OpsDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ops Dashboard</h1>
        <p className="text-muted-foreground">Your team's task overview and project status.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
        Kanban board with project cards and drag-and-drop task management will be built here.
      </div>
    </div>
  );
}
