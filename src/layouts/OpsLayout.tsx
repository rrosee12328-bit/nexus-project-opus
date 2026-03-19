import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { OpsSidebar } from "@/components/OpsSidebar";
import { NotificationBell } from "@/components/NotificationBell";

export default function OpsLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <OpsSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-12 flex items-center justify-between border-b border-border px-4">
            <SidebarTrigger />
            <NotificationBell />
          </header>
          <main className="flex-1 p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
