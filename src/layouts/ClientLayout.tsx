import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/NotificationBell";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  FolderKanban,
  Upload,
  MessageSquare,
  CreditCard,
  Settings,
  LogOut,
  Bot,
  FileCheck,
  MoreHorizontal,
  X,
} from "lucide-react";
import { useState } from "react";

export default function ClientLayout() {
  const { user, loading, signOut } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

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

  const { data: profile } = useQuery({
    queryKey: ["client-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
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
    refetchInterval: 30000,
  });

  const { data: pendingApprovalCount = 0 } = useQuery({
    queryKey: ["pending-approval-count", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("approval_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading your portal…</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const displayName = profile?.display_name || user.email?.split("@")[0] || "";
  const initials = (displayName || user.email || "U")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Primary tabs shown in bottom bar (max 5 for mobile)
  const primaryTabs = [
    { title: "Home", url: "/portal", icon: LayoutDashboard, badge: 0 },
    { title: "Projects", url: "/portal/projects", icon: FolderKanban, badge: 0 },
    { title: "Messages", url: "/portal/messages", icon: MessageSquare, badge: unreadCount },
    { title: "Approvals", url: "/portal/approvals", icon: FileCheck, badge: pendingApprovalCount },
    { title: "More", url: "#more", icon: MoreHorizontal, badge: 0 },
  ];

  // Secondary items shown in "More" sheet
  const secondaryItems = [
    { title: "Assets", url: "/portal/assets", icon: Upload, badge: 0 },
    { title: "Payments", url: "/portal/payments", icon: CreditCard, badge: 0 },
    { title: "AI Assistant", url: "/portal/agent", icon: Bot, badge: 0 },
    { title: "Settings", url: "/portal/settings", icon: Settings, badge: 0 },
  ];

  // All items for desktop nav
  const allItems = [
    { title: "Dashboard", url: "/portal", icon: LayoutDashboard, badge: 0 },
    { title: "Projects", url: "/portal/projects", icon: FolderKanban, badge: 0 },
    { title: "Approvals", url: "/portal/approvals", icon: FileCheck, badge: pendingApprovalCount },
    { title: "Assets", url: "/portal/assets", icon: Upload, badge: 0 },
    { title: "Messages", url: "/portal/messages", icon: MessageSquare, badge: unreadCount },
    { title: "Payments", url: "/portal/payments", icon: CreditCard, badge: 0 },
    { title: "AI Assistant", url: "/portal/agent", icon: Bot, badge: 0 },
    { title: "Settings", url: "/portal/settings", icon: Settings, badge: 0 },
  ];

  const isTabActive = (url: string) => {
    if (url === "/portal") return location.pathname === "/portal";
    return location.pathname.startsWith(url);
  };

  // Check if any secondary item is active (to highlight "More" tab)
  const isMoreActive = secondaryItems.some((item) => isTabActive(item.url));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar — simplified on mobile */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="flex h-14 md:h-16 items-center justify-between px-4 md:px-8">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src="/vektiss-icon.png" alt="Vektiss" className="h-8 w-8 md:h-10 md:w-10 object-contain" />
            <span className="hidden lg:inline text-sm font-semibold text-foreground">Vektiss</span>
          </div>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {allItems.map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                end={item.url === "/portal"}
                className="relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm text-muted-foreground transition-all hover:bg-accent/10 hover:text-foreground"
                activeClassName="bg-primary/10 text-primary font-medium"
              >
                <item.icon className="h-4 w-4" />
                {item.title}
                {item.badge > 0 && (
                  <Badge className="h-5 min-w-[20px] px-1.5 text-[10px] font-mono bg-primary text-primary-foreground">
                    {item.badge > 99 ? "99+" : item.badge}
                  </Badge>
                )}
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <div className="flex items-center gap-2">
            <NotificationBell />
            <div className="hidden lg:flex flex-col items-end mr-1">
              <span className="text-xs font-medium">{displayName}</span>
              <span className="text-[10px] text-muted-foreground">{user.email}</span>
            </div>
            <Avatar className="h-8 w-8 border border-border hidden sm:flex">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="hidden md:flex text-muted-foreground hover:text-foreground"
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main content — extra bottom padding on mobile for tab bar */}
      <main className="flex-1 px-4 py-6 md:px-8 md:py-8 lg:px-12 pb-24 md:pb-8">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>

      {/* Mobile "More" overlay */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          {/* Sheet */}
          <div className="relative bg-card rounded-t-2xl border-t border-border px-2 pt-3 pb-safe animate-in slide-in-from-bottom-4 duration-300">
            {/* Handle */}
            <div className="mx-auto w-10 h-1 rounded-full bg-muted-foreground/30 mb-4" />

            <div className="grid grid-cols-4 gap-1 px-2 mb-3">
              {secondaryItems.map((item) => (
                <NavLink
                  key={item.url}
                  to={item.url}
                  className="flex flex-col items-center gap-1.5 rounded-xl py-3 px-2 text-muted-foreground transition-colors active:scale-95"
                  activeClassName="bg-primary/10 text-primary"
                  onClick={() => setMoreOpen(false)}
                >
                  <div className="h-10 w-10 rounded-xl bg-secondary/50 flex items-center justify-center">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <span className="text-[11px] font-medium">{item.title}</span>
                </NavLink>
              ))}
            </div>

            {/* Sign out */}
            <div className="border-t border-border pt-2 pb-2 px-2">
              <button
                onClick={() => { signOut(); setMoreOpen(false); }}
                className="flex items-center gap-3 w-full rounded-xl px-4 py-3 text-sm text-muted-foreground hover:bg-accent/10 active:scale-[0.98] transition-all"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-xl border-t border-border pb-safe">
        <div className="flex items-center justify-around h-16 px-1">
          {primaryTabs.map((tab) => {
            const isMore = tab.url === "#more";
            const active = isMore ? (moreOpen || isMoreActive) : isTabActive(tab.url);

            if (isMore) {
              return (
                <button
                  key="more"
                  onClick={() => setMoreOpen(!moreOpen)}
                  className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {moreOpen ? <X className="h-5 w-5" /> : <tab.icon className="h-5 w-5" />}
                  <span className="text-[10px] font-medium">{moreOpen ? "Close" : tab.title}</span>
                </button>
              );
            }

            return (
              <NavLink
                key={tab.url}
                to={tab.url}
                end={tab.url === "/portal"}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors text-muted-foreground`}
                activeClassName="text-primary"
                onClick={() => setMoreOpen(false)}
              >
                <div className="relative">
                  <tab.icon className="h-5 w-5" />
                  {tab.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 h-4 min-w-[16px] px-1 text-[9px] font-bold bg-primary text-primary-foreground rounded-full flex items-center justify-center">
                      {tab.badge > 99 ? "99+" : tab.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{tab.title}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Footer — desktop only */}
      <footer className="hidden md:block border-t border-border px-6 py-4">
        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Vektiss Creative — Your creative partner
        </p>
      </footer>
    </div>
  );
}
