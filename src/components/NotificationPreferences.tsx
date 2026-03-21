import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Mail, Save, MessageSquare, ListTodo, DollarSign, FolderKanban, Newspaper } from "lucide-react";
import { toast } from "sonner";

interface Preferences {
  in_app_messages: boolean;
  in_app_tasks: boolean;
  in_app_payments: boolean;
  in_app_projects: boolean;
  email_messages: boolean;
  email_tasks: boolean;
  email_payments: boolean;
  email_projects: boolean;
  email_digest: boolean;
}

const DEFAULT_PREFS: Preferences = {
  in_app_messages: true,
  in_app_tasks: true,
  in_app_payments: true,
  in_app_projects: true,
  email_messages: true,
  email_tasks: true,
  email_payments: true,
  email_projects: true,
  email_digest: false,
};

const CATEGORIES = [
  { key: "messages", label: "Messages", desc: "New messages from team or clients", icon: MessageSquare },
  { key: "tasks", label: "Tasks", desc: "Task assignments and updates", icon: ListTodo },
  { key: "payments", label: "Payments", desc: "Payment confirmations and reminders", icon: DollarSign },
  { key: "projects", label: "Projects", desc: "Project status and phase changes", icon: FolderKanban },
] as const;

export function NotificationPreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [dirty, setDirty] = useState(false);

  const { data: savedPrefs, isLoading } = useQuery({
    queryKey: ["notification-preferences", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (savedPrefs) {
      setPrefs({
        in_app_messages: savedPrefs.in_app_messages,
        in_app_tasks: savedPrefs.in_app_tasks,
        in_app_payments: savedPrefs.in_app_payments,
        in_app_projects: savedPrefs.in_app_projects,
        email_messages: savedPrefs.email_messages,
        email_tasks: savedPrefs.email_tasks,
        email_payments: savedPrefs.email_payments,
        email_projects: savedPrefs.email_projects,
        email_digest: savedPrefs.email_digest,
      });
    }
  }, [savedPrefs]);

  const savePrefs = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      if (savedPrefs) {
        const { error } = await supabase
          .from("notification_preferences")
          .update(prefs)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("notification_preferences")
          .insert({ ...prefs, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences", user?.id] });
      setDirty(false);
      toast.success("Notification preferences saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggle = (key: keyof Preferences) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    setDirty(true);
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading preferences...</p>;

  return (
    <div className="space-y-6">
      {/* In-App & Email grid */}
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_60px_60px] sm:grid-cols-[1fr_80px_80px] gap-1 sm:gap-2 px-3 sm:px-4 py-2.5 bg-secondary/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <span>Category</span>
          <span className="text-center flex items-center justify-center gap-1"><Bell className="h-3 w-3" /> <span className="hidden sm:inline">In-App</span><span className="sm:hidden">App</span></span>
          <span className="text-center flex items-center justify-center gap-1"><Mail className="h-3 w-3" /> Email</span>
        </div>

        {CATEGORIES.map((cat, i) => {
          const Icon = cat.icon;
          return (
            <div
              key={cat.key}
              className={`grid grid-cols-[1fr_60px_60px] sm:grid-cols-[1fr_80px_80px] gap-1 sm:gap-2 px-3 sm:px-4 py-3 items-center ${
                i < CATEGORIES.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{cat.label}</p>
                  <p className="text-xs text-muted-foreground hidden sm:block">{cat.desc}</p>
                </div>
              </div>
              <div className="flex justify-center">
                <Switch
                  checked={prefs[`in_app_${cat.key}` as keyof Preferences] as boolean}
                  onCheckedChange={() => toggle(`in_app_${cat.key}` as keyof Preferences)}
                />
              </div>
              <div className="flex justify-center">
                <Switch
                  checked={prefs[`email_${cat.key}` as keyof Preferences] as boolean}
                  onCheckedChange={() => toggle(`email_${cat.key}` as keyof Preferences)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Weekly Digest */}
      <div className="rounded-lg border border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Newspaper className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Weekly Digest</p>
              <p className="text-xs text-muted-foreground">
                Receive a Monday morning summary with revenue, project updates, tasks, and key metrics
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">Mon 8 AM</Badge>
            <Switch
              checked={prefs.email_digest}
              onCheckedChange={() => toggle("email_digest")}
            />
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <Button
          onClick={() => savePrefs.mutate()}
          disabled={savePrefs.isPending || !dirty}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {savePrefs.isPending ? "Saving..." : "Save Preferences"}
        </Button>
      </div>
    </div>
  );
}
