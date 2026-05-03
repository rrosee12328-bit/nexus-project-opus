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
  ChevronRight,
  Command,
  Briefcase,
  TrendingUp,
  Truck,
  Cog,
  Radio,
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type NavItem = { title: string; url: string; icon: any };
type NavGroup = { label: string; icon: any; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "Command",
    icon: Command,
    items: [
      { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
      { title: "Calendar", url: "/admin/calendar", icon: Calendar },
      { title: "AI Agent", url: "/admin/agent", icon: Bot },
    ],
  },
  {
    label: "Clients",
    icon: Briefcase,
    items: [
      { title: "Client Management", url: "/admin/clients", icon: Users },
      { title: "Knowledge / Brain", url: "/admin/knowledge-base", icon: Brain },
      { title: "Client Summaries", url: "/admin/summaries", icon: BookOpen },
      { title: "Client Tracker", url: "/admin/tracker", icon: Sheet },
    ],
  },
  {
    label: "Sales",
    icon: TrendingUp,
    items: [
      { title: "Sales Pipeline", url: "/admin/leads", icon: Target },
      { title: "Proposals", url: "/admin/proposals", icon: FileText },
    ],
  },
  {
    label: "Delivery",
    icon: Truck,
    items: [
      { title: "Project Management", url: "/admin/projects", icon: FolderKanban },
      { title: "Assets", url: "/admin/assets", icon: Upload },
      { title: "Business Media", url: "/admin/business-media", icon: Video },
    ],
  },
  {
    label: "Communication",
    icon: Radio,
    items: [
      { title: "Messages", url: "/admin/messages", icon: MessageSquare },
      { title: "Email Dashboard", url: "/admin/emails", icon: Mail },
      { title: "Call Intelligence", url: "/admin/calls", icon: Phone },
    ],
  },
  {
    label: "Finance",
    icon: DollarSign,
    items: [
      { title: "Financial Tracking", url: "/admin/financials", icon: DollarSign },
      { title: "Hourly Invoices", url: "/admin/invoices", icon: Receipt },
      { title: "Reports", url: "/admin/reports", icon: BarChart3 },
    ],
  },
  {
    label: "System",
    icon: Cog,
    items: [
      { title: "Ops Portal", url: "/ops", icon: ClipboardList },
      { title: "PDF Logs", url: "/admin/pdf-logs", icon: ScrollText },
      { title: "Settings", url: "/admin/settings", icon: Settings },
    ],
  },
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

  const groupHasActive = (group: NavGroup) => group.items.some((i) => isActive(i.url));

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
        {navGroups.map((group) => {
          const activeInGroup = groupHasActive(group);
          // When collapsed, render flat icon-only buttons (no nesting)
          if (collapsed) {
            return (
              <SidebarGroup key={group.label}>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                          <NavLink
                            to={item.url}
                            end={item.url === "/admin"}
                            className="relative hover:bg-sidebar-accent transition-colors"
                            activeClassName="bg-sidebar-accent text-sidebar-primary"
                            onClick={handleNavClick}
                          >
                            <item.icon className="h-4 w-4" />
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }
          return (
            <Collapsible key={group.label} defaultOpen={activeInGroup} className="group/collapsible">
              <SidebarGroup>
                <SidebarGroupLabel asChild className="kicker !text-[12px] cursor-pointer hover:text-foreground transition-colors py-2">
                  <CollapsibleTrigger className="flex w-full items-center justify-between">
                    <span className="flex items-center gap-2">
                      <group.icon className="h-3.5 w-3.5" />
                      {group.label}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton asChild isActive={isActive(item.url)}>
                            <NavLink
                              to={item.url}
                              end={item.url === "/admin"}
                              className="relative hover:bg-sidebar-accent transition-colors"
                              activeClassName="bg-sidebar-accent text-sidebar-primary [&_.nav-indicator]:opacity-100"
                              onClick={handleNavClick}
                            >
                              <span className="nav-indicator absolute left-0 top-1/2 -translate-y-1/2 h-4 w-px bg-primary opacity-0 shadow-[0_0_8px_hsl(var(--primary))] transition-opacity" />
                              <item.icon className="h-4 w-4" />
                              <span className="text-sm tracking-tight">{item.title}</span>
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}
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
