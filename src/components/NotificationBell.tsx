import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Bell, Check, MessageSquare, DollarSign, FolderKanban, Info, CheckCheck, ListTodo } from "lucide-react";
import { formatDistanceToNow, isToday, isYesterday } from "date-fns";

const TYPE_ICONS: Record<string, typeof Info> = {
  message: MessageSquare,
  payment: DollarSign,
  project: FolderKanban,
  task: ListTodo,
  info: Info,
};

const TYPE_COLORS: Record<string, string> = {
  message: "text-primary",
  payment: "text-emerald-400",
  project: "text-purple-400",
  task: "text-amber-400",
  info: "text-muted-foreground",
};

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "message", label: "Messages" },
  { key: "project", label: "Projects" },
  { key: "task", label: "Tasks" },
  { key: "payment", label: "Payments" },
] as const;

interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  type: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

function groupByDate(notifications: Notification[]) {
  const groups: { label: string; items: Notification[] }[] = [];
  const today: Notification[] = [];
  const yesterday: Notification[] = [];
  const earlier: Notification[] = [];

  for (const n of notifications) {
    const d = new Date(n.created_at);
    if (isToday(d)) today.push(n);
    else if (isYesterday(d)) yesterday.push(n);
    else earlier.push(n);
  }

  if (today.length) groups.push({ label: "Today", items: today });
  if (yesterday.length) groups.push({ label: "Yesterday", items: yesterday });
  if (earlier.length) groups.push({ label: "Earlier", items: earlier });
  return groups;
}

export function NotificationBell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Notification[];
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("notifications-rt")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const filtered = filter === "all" ? notifications : notifications.filter((n) => n.type === filter);
  const groups = groupByDate(filtered);

  // Count unread per type for badge on tabs
  const unreadByType: Record<string, number> = {};
  for (const n of notifications) {
    if (!n.read_at) {
      unreadByType[n.type] = (unreadByType[n.type] || 0) + 1;
    }
  }

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
      if (unreadIds.length === 0) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const handleClick = (notification: Notification) => {
    if (!notification.read_at) {
      markRead.mutate(notification.id);
    }
    if (notification.link) {
      window.location.href = notification.link;
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 text-[10px] font-mono bg-primary text-primary-foreground pointer-events-none">
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 gap-1 text-muted-foreground"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-3 py-2 border-b border-border overflow-x-auto">
          {FILTER_TABS.map((tab) => {
            const count = tab.key === "all" ? unreadCount : (unreadByType[tab.key] || 0);
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`text-xs px-2.5 py-1 rounded-md whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  filter === tab.key
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent/10"
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className="bg-primary/20 text-primary text-[10px] font-mono px-1.5 py-0.5 rounded-full leading-none">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <ScrollArea className="max-h-80">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 gap-2">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bell className="h-5 w-5 text-primary/40" />
              </div>
              <p className="text-xs text-muted-foreground">
                {filter === "all" ? "No notifications yet" : `No ${filter} notifications`}
              </p>
            </div>
          ) : (
            <div>
              {groups.map((group) => (
                <div key={group.label}>
                  <div className="px-4 py-1.5 bg-secondary/30">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {group.label}
                    </p>
                  </div>
                  <div className="divide-y divide-border">
                    {group.items.map((n) => {
                      const Icon = TYPE_ICONS[n.type] || Info;
                      const color = TYPE_COLORS[n.type] || "text-muted-foreground";
                      return (
                        <button
                          key={n.id}
                          onClick={() => handleClick(n)}
                          className={`w-full text-left px-4 py-3 hover:bg-accent/10 transition-colors flex gap-3 ${
                            !n.read_at ? "bg-primary/5" : ""
                          }`}
                        >
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Icon className={`h-4 w-4 ${color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={`text-sm leading-tight ${!n.read_at ? "font-semibold" : "font-medium text-muted-foreground"}`}>
                                {n.title}
                              </p>
                              {!n.read_at && (
                                <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                              )}
                            </div>
                            {n.body && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
