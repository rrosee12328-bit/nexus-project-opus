import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ScheduleCall() {
  const { data: schedulingUrl, isLoading, error } = useQuery({
    queryKey: ["client-scheduling-url"],
    queryFn: async () => {
      const { data, error: schedulingError } = await supabase.rpc("get_client_scheduling_url");
      if (schedulingError) throw schedulingError;
      return data as string | null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const embedUrl = useMemo(() => {
    if (!schedulingUrl) return null;
    const url = new URL(schedulingUrl);
    url.searchParams.set("embed_domain", window.location.hostname);
    url.searchParams.set("embed_type", "Inline");
    url.searchParams.set("hide_gdpr_banner", "1");
    return url.toString();
  }, [schedulingUrl]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-primary">
          <CalendarDays className="h-5 w-5" />
          <p className="text-xs font-semibold uppercase tracking-[0.16em]">Choose a time that works</p>
        </div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Schedule a call</h1>
        <p className="text-sm text-muted-foreground">
          Pick an available time below. Your confirmed meeting will appear in your Vektiss workspace automatically.
        </p>
      </header>

      {isLoading ? (
        <Skeleton className="h-[720px] w-full rounded-2xl" />
      ) : error || !embedUrl ? (
        <Card className="p-6 text-center sm:p-10">
          <CalendarDays className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h2 className="font-semibold">Scheduling is temporarily unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">Please try again shortly or send us a message from your workspace.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden border-primary/15 bg-card shadow-sm">
          <iframe
            src={embedUrl}
            title="Schedule a call with Vektiss"
            className="h-[760px] w-full border-0 sm:h-[780px]"
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <div className="flex flex-col gap-3 border-t bg-muted/30 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>If the calendar does not load, open the secure scheduling page directly.</span>
            <Button variant="ghost" size="sm" className="justify-start gap-2 sm:justify-center" asChild>
              <a href={schedulingUrl} target="_blank" rel="noopener noreferrer">
                Open Calendly <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
