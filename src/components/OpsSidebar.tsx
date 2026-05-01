import {
  LayoutDashboard,
  CheckSquare,
  BookOpen,
  Clock,
  Settings,
  LogOut,
  ArrowLeft,
  Bot,
  Mail,
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
  { title: "Dashboard", url: "/ops", icon: LayoutDashboard },
  { title: "Tasks", url: "/ops/tasks", icon: CheckSquare },
  { title: "Timesheets", url: "/ops/timesheets", icon: Clock },
  { title: "SOPs", url: "/ops/sops", icon: BookOpen },
  { title: "Email Intelligence", url: "/ops/email-intelligence", icon: Mail },
  { title: "AI Assistant", url: "/ops/agent", icon: Bot },
  { title: "Settings", url: "/ops/settings", icon: Settings },
];

export function OpsSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, role } = useAuth();

  const isActive = (url: string) =>
    url === "/ops"
      ? location.pathname === "/ops"
      : location.pathname.startsWith(url);

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-2">
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
                      end={item.url === "/ops"}
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary"
                      onClick={handleNavClick}
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
          {role === "admin" && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="hover:bg-sidebar-accent">
                <NavLink to="/admin" className="hover:bg-sidebar-accent" activeClassName="" onClick={handleNavClick}>
                  <ArrowLeft className="h-4 w-4" />
                  {!collapsed && <span>Back to Admin</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
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
