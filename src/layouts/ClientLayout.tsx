import { useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bot, CheckSquare2, CreditCard, FileCheck, FileSignature, FolderKanban, LogOut, Menu, MessageSquare, Phone, Settings, Upload, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { NavLink } from "@/components/NavLink";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function ClientLayout() {
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
      const { data, error } = await supabase.from("profiles").select("display_name, avatar_url").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["unread-messages", clientId],
    queryFn: async () => {
      const { count } = await supabase.from("messages").select("*", { count: "exact", head: true }).eq("client_id", clientId!).neq("sender_id", user!.id).is("read_at", null);
      return count ?? 0;
    },
    enabled: !!clientId && !!user?.id,
    refetchInterval: 30000,
  });

  const { data: pendingApprovalCount = 0 } = useQuery({
    queryKey: ["pending-approval-count", clientId],
    queryFn: async () => {
      const { count } = await supabase.from("approval_requests").select("*", { count: "exact", head: true }).eq("client_id", clientId!).eq("status", "pending");
      return count ?? 0;
    },
    enabled: !!clientId,
    refetchInterval: 30000,
  });

  const { data: pendingActionCount = 0 } = useQuery({
    queryKey: ["client-action-count", clientId],
    queryFn: async () => {
      const { count, error } = await supabase.from("client_action_items" as never)
        .select("id", { count: "exact", head: true }).eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!clientId,
    refetchInterval: 30000,
  });

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (!user) return <Navigate to="/login" replace />;

  const displayName = profile?.display_name || user.email?.split("@")[0] || "Client";
  const initials = displayName.split(" ").map((word) => word[0]).join("").toUpperCase().slice(0, 2);
  const primaryItems = [
    { title: "Ask Vektiss", url: "/portal", icon: Bot, badge: 0 },
    { title: "Projects", url: "/portal/projects", icon: FolderKanban, badge: 0 },
    { title: "Contracts", url: "/portal/contracts", icon: FileSignature, badge: 0 },
    { title: "Billing", url: "/portal/billing", icon: CreditCard, badge: 0 },
  ];
  const workspaceItems = [
    { title: "Actions", url: "/portal/actions", icon: CheckSquare2, badge: pendingActionCount },
    { title: "Approvals", url: "/portal/approvals", icon: FileCheck, badge: pendingApprovalCount },
    { title: "Messages", url: "/portal/messages", icon: MessageSquare, badge: unreadCount },
    { title: "Meeting notes", url: "/portal/calls", icon: Phone, badge: 0 },
    { title: "Files", url: "/portal/assets", icon: Upload, badge: 0 },
  ];

  const navigation = <>
    <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20"><img src="/vektiss-icon.png" alt="Vektiss" className="h-7 w-7 object-contain" /></div>
      <div><p className="text-sm font-semibold tracking-tight text-sidebar-accent-foreground">Vektiss</p><p className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/60">Client space</p></div>
    </div>
    <nav className="flex-1 overflow-y-auto px-3 py-5">
      <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45">Your work</p>
      <div className="space-y-1">{primaryItems.map((item) => <NavLink key={item.url} to={item.url} end={item.url === "/portal"} onClick={() => setMobileNavOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"><item.icon className="h-4 w-4" /><span className="flex-1">{item.title}</span></NavLink>)}</div>
      <p className="px-3 pb-2 pt-7 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45">Workspace</p>
      <div className="space-y-1">{workspaceItems.map((item) => <NavLink key={item.url} to={item.url} onClick={() => setMobileNavOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"><item.icon className="h-4 w-4" /><span className="flex-1">{item.title}</span>{item.badge > 0 && <Badge className="h-5 min-w-5 justify-center px-1 text-[10px]">{item.badge}</Badge>}</NavLink>)}</div>
    </nav>
    <div className="border-t border-sidebar-border p-3">
      <NavLink to="/portal/settings" onClick={() => setMobileNavOpen(false)} className="mb-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"><Settings className="h-4 w-4" /> Settings</NavLink>
      <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/60 p-2.5"><Avatar className="h-9 w-9 border border-sidebar-border"><AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-sidebar-accent-foreground">{displayName}</p><p className="truncate text-[10px] text-sidebar-foreground/60">{user.email}</p></div><Button variant="ghost" size="icon" className="h-8 w-8" onClick={signOut} title="Sign out"><LogOut className="h-4 w-4" /></Button></div>
    </div>
  </>;

  const currentTitle = location.pathname === "/portal" ? "Ask Vektiss" : primaryItems.concat(workspaceItems).find((item) => location.pathname.startsWith(item.url))?.title || "Client portal";

  return <div className="min-h-screen min-w-0 max-w-full bg-background md:flex">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar md:flex">{navigation}</aside>
    {mobileNavOpen && <div className="fixed inset-0 z-50 md:hidden"><button className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" /><aside className="relative flex h-full w-[min(86vw,19rem)] flex-col border-r border-sidebar-border bg-sidebar shadow-2xl"><Button variant="ghost" size="icon" className="absolute right-3 top-5 z-10 h-9 w-9" onClick={() => setMobileNavOpen(false)}><X className="h-4 w-4" /></Button>{navigation}</aside></div>}
    <div className="min-w-0 flex-1 md:pl-64">
      <header className="sticky top-0 z-30 flex h-14 min-w-0 items-center justify-between border-b border-border/70 bg-background/85 px-2.5 backdrop-blur-xl sm:px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2"><Button variant="ghost" size="icon" className="shrink-0 md:hidden" onClick={() => setMobileNavOpen(true)}><Menu className="h-5 w-5" /></Button><div className="min-w-0"><p className="truncate text-sm font-medium">{currentTitle}</p><p className="hidden text-[10px] text-muted-foreground sm:block">Projects, meetings, agreements, and billing in one place</p></div></div>
        <div className="flex items-center gap-1"><ThemeToggle /><NotificationBell /></div>
      </header>
      <main data-portal-page className={location.pathname === "/portal" ? "min-h-[calc(100dvh-3.5rem)] min-w-0" : "min-w-0 px-3 py-4 sm:px-4 sm:py-6 md:px-8 md:py-8"}><div className={location.pathname === "/portal" ? "h-full min-w-0" : "mx-auto min-w-0 max-w-6xl"}><Outlet /></div></main>
    </div>
  </div>;
}
