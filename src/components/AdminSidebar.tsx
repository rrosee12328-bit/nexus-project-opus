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
  { title: "Client Management", url: "/admin/clients", icon: Users },
  { title: "Project Management", url: "/admin/projects", icon: FolderKanban },
  { title: "Assets", url: "/admin/assets", icon: Upload },
  { title: "Messages", url: "/admin/messages", icon: MessageSquare },
  { title: "Financial Tracking", url: "/admin/financials", icon: DollarSign },
  { title: "Reports", url: "/admin/reports", icon: BarChart3 },
  { title: "Ops Portal", url: "/ops", icon: ClipboardList },
  { title: "Email Dashboard", url: "/admin/emails", icon: Mail },
  { title: "AI Agent", url: "/admin/agent", icon: Bot },
  { title: "Settings", url: "/admin/settings", icon: Settings },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut } = useAuth();

  const isActive = (url: string) =>
    url === "/admin"
      ? location.pathname === "/admin"
      : location.pathname.startsWith(url);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        {!collapsed && (
          <img src="/vektiss-logo.png" alt="Vektiss" className="h-20 object-contain" />
        )}
        {collapsed && (
          <img src="/vektiss-icon.png" alt="Vektiss" className="h-12 w-12 object-contain" />
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/admin"}
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
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
