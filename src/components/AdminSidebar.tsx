import {
  LayoutDashboard,
  Users,
  FolderKanban,
  MessageSquare,
  DollarSign,
  Settings,
  LogOut,
  Upload,
  ClipboardList,
  BarChart3,
  Mail,
  Bot,
  Calendar,
  Target,
  FileText,
  BookOpen,
  Sheet,
  Phone,
  Brain,
  Receipt,
  ScrollText,
  Video,
  Cpu,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Calendar", url: "/admin/calendar", icon: Calendar },
  { title: "Client Management", url: "/admin/clients", icon: Users },
  { title: "Client Summaries", url: "/admin/summaries", icon: BookOpen },
  { title: "Call Intelligence", url: "/admin/calls", icon: Phone },
  { title: "The Brain", url: "/admin/knowledge-base", icon: Brain },
  { title: "Sales Pipeline", url: "/admin/leads", icon: Target },
  { title: "Proposals", url: "/admin/proposals", icon: FileText },
  { title: "Project Management", url: "/admin/projects", icon: FolderKanban },
  { title: "Assets", url: "/admin/assets", icon: Upload },
  { title: "Messages", url: "/admin/messages", icon: MessageSquare },
  { title: "Client Tracker", url: "/admin/tracker", icon: Sheet },
  { title: "Financial Tracking", url: "/admin/financials", icon: DollarSign },
  { title: "Hourly Invoices", url: "/admin/invoices", icon: Receipt },
  { title: "Reports", url: "/admin/reports", icon: BarChart3 },
  { title: "Ops Portal", url: "/ops", icon: ClipboardList },
  { title: "Email Dashboard", url: "/admin/emails", icon: Mail },
  { title: "AI Agent", url: "/admin/agent", icon: Bot },
  { title: "Business Media", url: "/admin/business-media", icon: Video },
  { title: "PDF Logs", url: "/admin/pdf-logs", icon: ScrollText },
  { title: "Settings", url: "/admin/settings", icon: Settings },
];

export function AdminSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut } = useAuth();

  const isActive = (url: string) =>
    url === "/admin"
      ? location.pathname === "/admin"
      : location.pathname.startsWith(url);

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/60">
      <SidebarHeader className="border-b border-sidebar-border/60 px-4 py-2 relative">
        <span className="absolute bottom-0 left-0 right-0 h-px edge-line opacity-60" />
        {!collapsed && (
          <img src="/vektiss-logo.png" alt="Vektiss" className="h-20 object-contain" />
        )}
        {collapsed && (
          <img src="/vektiss-icon.png" alt="Vektiss" className="h-12 w-12 object-contain" />
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="kicker !text-[10px]">
            {!collapsed && "// Navigation"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/admin"}
                      className="relative hover:bg-sidebar-accent transition-colors group"
                      activeClassName="bg-sidebar-accent text-sidebar-primary [&_.nav-indicator]:opacity-100"
                      onClick={handleNavClick}
                    >
                      <span className="nav-indicator absolute left-0 top-1/2 -translate-y-1/2 h-4 w-px bg-primary opacity-0 shadow-[0_0_8px_hsl(var(--primary))] transition-opacity" />
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span className="text-[13px] tracking-tight">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/60 p-2 relative">
        <span className="absolute top-0 left-0 right-0 h-px edge-line opacity-60" />
        {!collapsed && (
          <div className="px-2 pt-1 pb-2 flex items-center gap-2 kicker">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            System / Online
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} className="hover:bg-sidebar-accent">
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sign Out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
