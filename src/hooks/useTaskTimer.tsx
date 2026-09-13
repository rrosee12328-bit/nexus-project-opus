import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type TaskTimerTarget = {
  id: string;
  title: string;
  client_id: string | null;
  project_id: string | null;
};

type StoredTaskTimer = TaskTimerTarget & { startedAt: string };

type TaskTimerContextValue = {
  activeTimer: StoredTaskTimer | null;
  elapsed: number;
  isSaving: boolean;
  start: (task: TaskTimerTarget) => boolean;
  stop: () => Promise<void>;
};

const TaskTimerContext = createContext<TaskTimerContextValue | null>(null);

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatTaskTimer(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function TaskTimerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTimer, setActiveTimer] = useState<StoredTaskTimer | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const storageKey = user?.id ? `vektiss:task-timer:${user.id}` : null;

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`ops-task-sync:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["tasks"] });
          void queryClient.invalidateQueries({ queryKey: ["ops-tasks"] });
          void queryClient.invalidateQueries({ queryKey: ["ops-timer-tasks"] });
          void queryClient.invalidateQueries({ queryKey: ["timesheet-tasks"] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, user?.id]);

  useEffect(() => {
    if (!storageKey) {
      setActiveTimer(null);
      return;
    }

    try {
      const stored = window.localStorage.getItem(storageKey);
      const parsed = stored ? JSON.parse(stored) as StoredTaskTimer : null;
      setActiveTimer(
        parsed?.id && parsed?.title && parsed?.startedAt && !Number.isNaN(Date.parse(parsed.startedAt))
          ? parsed
          : null,
      );
    } catch {
      window.localStorage.removeItem(storageKey);
      setActiveTimer(null);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!activeTimer) {
      setElapsed(0);
      return;
    }

    const updateElapsed = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(activeTimer.startedAt)) / 1000)));
    };
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(interval);
  }, [activeTimer]);

  const start = useCallback((task: TaskTimerTarget) => {
    if (!storageKey) return false;
    if (activeTimer) {
      toast.error("Stop the current timer before starting another task");
      return false;
    }

    const next = { ...task, startedAt: new Date().toISOString() };
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    setActiveTimer(next);
    toast.success(`Timer started for "${task.title}"`);
    return true;
  }, [activeTimer, storageKey]);

  const stop = useCallback(async () => {
    if (!activeTimer || !storageKey || !user || isSaving) return;

    const endTime = new Date();
    const startTime = new Date(activeTimer.startedAt);
    const elapsedSeconds = Math.max(0, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));

    if (elapsedSeconds <= 10) {
      window.localStorage.removeItem(storageKey);
      setActiveTimer(null);
      toast.info("Timer was too short to log");
      return;
    }

    setIsSaving(true);
    try {
      const { data: currentTask, error: taskError } = await supabase
        .from("tasks")
        .select("id, title, client_id, project_id")
        .eq("id", activeTimer.id)
        .maybeSingle();
      if (taskError) throw taskError;

      const task = currentTask ?? activeTimer;
      const hours = Math.max(Math.round((elapsedSeconds / 3600) * 100) / 100, 0.01);
      const { error } = await supabase.from("time_entries").insert({
        user_id: user.id,
        start_time: startTime.toTimeString().slice(0, 5),
        end_time: endTime.toTimeString().slice(0, 5),
        hours,
        description: task.title,
        category: task.client_id ? "client_work" : "other",
        task_id: task.id,
        client_id: task.client_id,
        project_id: task.project_id,
        entry_date: formatLocalDate(startTime),
        day_of_week: startTime.toLocaleDateString("en-US", { weekday: "long" }),
      });
      if (error) throw error;

      window.localStorage.removeItem(storageKey);
      setActiveTimer(null);
      await queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      await queryClient.invalidateQueries({ queryKey: ["timesheet_dashboard"] });
      toast.success(`${formatTaskTimer(elapsedSeconds)} saved to Timesheets`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Time could not be saved: ${message}. The timer is still running.`);
    } finally {
      setIsSaving(false);
    }
  }, [activeTimer, isSaving, queryClient, storageKey, user]);

  return (
    <TaskTimerContext.Provider value={{ activeTimer, elapsed, isSaving, start, stop }}>
      {children}
    </TaskTimerContext.Provider>
  );
}

export function useTaskTimer() {
  const context = useContext(TaskTimerContext);
  if (!context) throw new Error("useTaskTimer must be used inside TaskTimerProvider");
  return context;
}
