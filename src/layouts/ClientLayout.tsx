import { Outlet, Navigate } from "react-router-dom";
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
  Menu,
  X,
  Bot,
  FileCheck,
} from "lucide-react";
import { useState } from "react";

export default function ClientLayout() {
  const { user, loading, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Fetch client ID
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

  // Fetch profile for avatar
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

  // Fetch unread message count
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

  // Fetch pending approval count
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

  const navItems = [
    { title: "Dashboard", url: "/portal", icon: LayoutDashboard, badge: 0 },
    { title: "Projects", url: "/portal/projects", icon: FolderKanban, badge: 0 },
    { title: "Approvals", url: "/portal/approvals", icon: FileCheck, badge: pendingApprovalCount },
    { title: "Assets", url: "/portal/assets", icon: Upload, badge: 0 },
    { title: "Messages", url: "/portal/messages", icon: MessageSquare, badge: unreadCount },
    { title: "Payments", url: "/portal/payments", icon: CreditCard, badge: 0 },
    { title: "AI Assistant", url: "/portal/agent", icon: Bot, badge: 0 },
    { title: "Settings", url: "/portal/settings", icon: Settings, badge: 0 },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top navigation bar */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between px-4 md:px-8">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-2 rounded-md hover:bg-accent/10 transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <img src="/vektiss-icon.png" alt="Vektiss" className="h-14 w-14 object-contain" />
          </div>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
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
            <div className="hidden sm:flex flex-col items-end mr-1">
              <span className="text-xs font-medium">{displayName}</span>
              <span className="text-[10px] text-muted-foreground">{user.email}</span>
            </div>
            <Avatar className="h-8 w-8 border border-border">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign Out
            </Button>
          </div>
        </div>

        {/* Mobile navigation dropdown */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border bg-background/95 backdrop-blur-xl px-4 pb-4 pt-2 space-y-1 animate-in slide-in-from-top-2 duration-200">
            {navItems.map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                end={item.url === "/portal"}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"
                activeClassName="bg-primary/10 text-primary font-medium"
                onClick={() => setMobileOpen(false)}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-4 w-4" />
                  {item.title}
                </div>
                {item.badge > 0 && (
                  <Badge className="h-5 min-w-[20px] px-1.5 text-[10px] font-mono bg-primary text-primary-foreground">
                    {item.badge}
                  </Badge>
                )}
              </NavLink>
            ))}
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 px-4 py-8 md:px-8 lg:px-12">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-4">
        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Vektiss Creative — Your creative partner
        </p>
      </footer>
    </div>
  );
}
