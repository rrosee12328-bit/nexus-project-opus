import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";
import { LayoutDashboard, FolderKanban, Upload, MessageSquare, Settings, LogOut } from "lucide-react";

const navItems = [
  { title: "Dashboard", url: "/portal", icon: LayoutDashboard },
  { title: "Projects", url: "/portal/projects", icon: FolderKanban },
  { title: "Assets", url: "/portal/assets", icon: Upload },
  { title: "Messages", url: "/portal/messages", icon: MessageSquare },
  { title: "Settings", url: "/portal/settings", icon: Settings },
];

export default function ClientLayout() {
  const { user, role, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (role === "admin") return <Navigate to="/admin" replace />;
  if (role === "ops") return <Navigate to="/ops" replace />;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-6">
          <span className="text-sm font-bold tracking-wider uppercase text-primary">Vektiss</span>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                end={item.url === "/portal"}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                activeClassName="bg-accent text-foreground"
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </NavLink>
            ))}
          </nav>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign Out
          </Button>
        </div>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
