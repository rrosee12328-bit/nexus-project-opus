import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { title: "Dashboard", url: "/portal", icon: LayoutDashboard },
  { title: "Projects", url: "/portal/projects", icon: FolderKanban },
  { title: "Assets", url: "/portal/assets", icon: Upload },
  { title: "Messages", url: "/portal/messages", icon: MessageSquare },
  { title: "Payments", url: "/portal/payments", icon: CreditCard },
  { title: "Settings", url: "/portal/settings", icon: Settings },
];

export default function ClientLayout() {
  const { user, role, loading, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

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

  const initials = user.email?.slice(0, 2).toUpperCase() ?? "U";

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
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground text-xs font-bold">V</span>
              </div>
              <span className="text-sm font-bold tracking-wider uppercase">Vektiss</span>
            </div>
          </div>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                end={item.url === "/portal"}
                className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm text-muted-foreground transition-all hover:bg-accent/10 hover:text-foreground"
                activeClassName="bg-primary/10 text-primary font-medium"
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <div className="flex items-center gap-3">
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
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"
                activeClassName="bg-primary/10 text-primary font-medium"
                onClick={() => setMobileOpen(false)}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
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
