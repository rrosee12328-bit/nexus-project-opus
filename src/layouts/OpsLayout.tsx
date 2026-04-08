import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { OpsSidebar } from "@/components/OpsSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function OpsLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <OpsSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 md:h-14 flex items-center justify-between border-b border-border px-4 shrink-0 sticky top-0 z-30 bg-background/80 backdrop-blur-xl pt-safe">
            <SidebarTrigger className="shrink-0" />
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
