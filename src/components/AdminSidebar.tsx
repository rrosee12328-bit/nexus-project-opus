import { CalendarDays, Users, Briefcase, TrendingUp, Wallet, Settings, LogOut, Sparkles, ChevronDown } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";

const groups = [
  { label: "Today", icon: CalendarDays, items: [["Today", "/admin"], ["Calendar", "/admin/calendar"], ["Assistant", "/admin/agent"], ["Brain", "/admin/brain"]] },
  { label: "Clients", icon: Users, items: [["All clients", "/admin/clients"], ["Messages", "/admin/messages"], ["Calls", "/admin/calls"], ["Email", "/admin/emails"], ["Summaries", "/admin/summaries"], ["Tracker", "/admin/tracker"]] },
  { label: "Sales", icon: TrendingUp, items: [["Pipeline", "/admin/leads"], ["Proposals", "/admin/proposals"]] },
  { label: "Work", icon: Briefcase, items: [["Projects", "/admin/projects"], ["Tasks", "/ops/tasks"], ["Time", "/ops/timesheets"], ["Files", "/admin/assets"], ["Media", "/admin/business-media"], ["Intakes", "/admin/intakes"], ["Knowledge", "/admin/lever"]] },
  { label: "Money", icon: Wallet, items: [["Financials", "/admin/financials"], ["Invoices", "/admin/invoices"], ["Reports", "/admin/reports"]] },
];

export function AdminSidebar() {
  const { isMobile, setOpenMobile, state } = useSidebar();
  const { signOut } = useAuth();
  const location = useLocation();
  const close = () => { if (isMobile) setOpenMobile(false); };
  const active = (url: string) => url === "/admin" ? location.pathname === url : location.pathname.startsWith(url);
  return <Sidebar collapsible="icon" className="border-r border-sidebar-border/60">
    <SidebarHeader className="h-20 justify-center border-b px-4"><NavLink to="/admin" onClick={close} className="flex items-center gap-3"><img src="/vektiss-icon.png" alt="Vektiss" className="h-8 w-8" />{state !== "collapsed" && <span className="font-semibold tracking-tight">Vektiss<span className="block text-xs font-normal text-muted-foreground">Your workspace</span></span>}</NavLink></SidebarHeader>
    <SidebarContent className="px-2 py-4">
      {groups.map(group => <details key={`${group.label}-${location.pathname}`} open={group.items.some(([, url]) => active(url)) || state === "collapsed"} className="group mb-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-sidebar-accent"><group.icon className="h-4 w-4 shrink-0" />{state !== "collapsed" && <><span className="flex-1">{group.label}</span><ChevronDown className="h-3 w-3" /></>}</summary>
        <SidebarMenu className={state === "collapsed" ? "" : "mt-1 border-l ml-5 pl-2"}>{group.items.map(([label, url]) => <SidebarMenuItem key={url}><SidebarMenuButton asChild isActive={active(url)} tooltip={label}><NavLink end={url === "/admin"} to={url} onClick={close} className="min-h-10" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">{state === "collapsed" ? <span className="text-xs">{label.slice(0, 2)}</span> : label}</NavLink></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>
      </details>)}
    </SidebarContent>
    <SidebarFooter className="border-t p-2"><SidebarMenu>
      <SidebarMenuItem><SidebarMenuButton asChild tooltip="Settings"><NavLink to="/admin/settings" onClick={close}><Settings className="h-4 w-4" /><span>Settings</span></NavLink></SidebarMenuButton></SidebarMenuItem>
      <SidebarMenuItem><SidebarMenuButton asChild tooltip="Diagnostics"><NavLink to="/admin/pdf-logs" onClick={close}><Sparkles className="h-4 w-4" /><span>Diagnostics</span></NavLink></SidebarMenuButton></SidebarMenuItem>
      <SidebarMenuItem><SidebarMenuButton asChild tooltip="Import review"><NavLink to="/admin/seed-review" onClick={close}><Briefcase className="h-4 w-4" /><span>Import review</span></NavLink></SidebarMenuButton></SidebarMenuItem>
      <SidebarMenuItem><SidebarMenuButton onClick={signOut}><LogOut className="h-4 w-4" /><span>Sign out</span></SidebarMenuButton></SidebarMenuItem>
    </SidebarMenu></SidebarFooter>
  </Sidebar>;
}
