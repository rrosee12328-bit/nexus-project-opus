import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Star, Calendar, User, ArrowRight } from "lucide-react";
import { format, isToday, isPast, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import type { Database } from "@/integrations/supabase/types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type TaskStatus = Database["public"]["Enums"]["task_status"];

interface TaskWithClient extends Task {
  clients: { name: string } | null;
}

interface TodayFocusPanelProps {
  tasks: TaskWithClient[];
  teamMembers: { id: string; name: string; role: string }[];
  onTaskClick: (task: TaskWithClient) => void;
}

const priorityColor: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/20 text-primary",
  high: "bg-warning/20 text-warning",
  urgent: "bg-destructive/20 text-destructive",
};

const statusLabel: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};

export default function TodayFocusPanel({ tasks, teamMembers, onTaskClick }: TodayFocusPanelProps) {
  const queryClient = useQueryClient();

  // Today's focus = manually flagged OR due today/overdue (exclude done)
  const focusTasks = tasks.filter((t) => {
    if (t.status === "done") return false;
    if ((t as any).daily_focus) return true;
    if (t.due_date) {
      const due = parseISO(t.due_date);
      return isToday(due) || isPast(due);
    }
    return false;
  });

  const toggleFocus = useMutation({
    mutationFn: async ({ id, focused }: { id: string; focused: boolean }) => {
      const { error } = await supabase.from("tasks").update({ daily_focus: focused } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const getAssigneeName = (userId: string | null) => {
    if (!userId) return null;
    return teamMembers.find((m) => m.id === userId)?.name ?? null;
  };

  if (focusTasks.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.25 }}>
        <Card className="border-dashed border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Star className="h-4 w-4 text-primary fill-primary" />
              <h2 className="text-sm font-semibold">Today's Focus</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              No tasks focused for today. Star tasks on the board below or set due dates to auto-populate this section.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.25 }}>
      <Card className="border-primary/20 bg-primary/[0.02]">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-4 w-4 text-primary fill-primary" />
            <h2 className="text-sm font-semibold">Today's Focus</h2>
            <Badge variant="secondary" className="text-xs font-mono">{focusTasks.length}</Badge>
          </div>
          <div className="space-y-2">
            <AnimatePresence>
              {focusTasks.map((task) => {
                const assignee = getAssigneeName(task.assigned_to);
                const isOverdue = task.due_date && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date));
                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="group flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-accent/30 transition-colors cursor-pointer"
                    onClick={() => onTaskClick(task)}
                  >
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFocus.mutate({ id: task.id, focused: !(task as any).daily_focus });
                      }}
                      className="shrink-0"
                    >
                      <Checkbox
                        checked={(task as any).daily_focus === true}
                        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] ${priorityColor[task.priority]}`}>{task.priority}</Badge>
                        <span className="text-[10px] text-muted-foreground">{statusLabel[task.status]}</span>
                        {task.due_date && (
                          <span className={`text-[10px] flex items-center gap-0.5 ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                            <Calendar className="h-2.5 w-2.5" />
                            {isOverdue ? "Overdue" : format(parseISO(task.due_date), "MMM d")}
                          </span>
                        )}
                      </div>
                    </div>
                    {assignee && (
                      <div className="flex items-center gap-1 shrink-0">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{assignee}</span>
                      </div>
                    )}
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
