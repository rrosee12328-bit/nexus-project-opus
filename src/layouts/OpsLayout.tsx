import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { OpsSidebar } from "@/components/OpsSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function OpsLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background relative">
        <div className="pointer-events-none fixed inset-0 z-0 bg-grid opacity-60" />
        <div className="pointer-events-none fixed inset-x-0 top-0 h-[420px] z-0 bg-hero-glow" />
        <OpsSidebar />
        <div className="flex-1 flex flex-col min-w-0 relative z-10">
          <header className="h-14 md:h-14 flex items-center justify-between border-b border-border/60 px-4 shrink-0 sticky top-0 z-30 bg-background/70 backdrop-blur-xl pt-safe relative">
            <span className="absolute bottom-0 left-0 right-0 h-px edge-line opacity-60" />
            <div className="flex items-center gap-3">
              <SidebarTrigger className="shrink-0" />
              <span className="hidden sm:flex items-center gap-2 kicker">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                Vektiss / Ops Layer
              </span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <ThemeToggle />
              <NotificationBell />
            </div>
          </header>
          <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden pb-safe">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
