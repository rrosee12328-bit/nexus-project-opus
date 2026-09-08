/* eslint-disable @typescript-eslint/no-explicit-any -- New Supabase columns are typed after the migration is deployed. */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, PlayCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OnboardingExperienceSettings() {
  const queryClient = useQueryClient();
  const [welcomeVideoUrl, setWelcomeVideoUrl] = useState("");
  const [calendlyUrl, setCalendlyUrl] = useState("");
  const settings = useQuery({
    queryKey: ["onboarding-experience-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("business_settings")
        .select("id, onboarding_welcome_video_url, onboarding_calendly_url").eq("singleton", true).single();
      if (error) throw error;
      return data as { id: string; onboarding_welcome_video_url: string | null; onboarding_calendly_url: string | null };
    },
  });
  useEffect(() => {
    if (!settings.data) return;
    setWelcomeVideoUrl(settings.data.onboarding_welcome_video_url || "");
    setCalendlyUrl(settings.data.onboarding_calendly_url || "");
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (welcomeVideoUrl && !URL.canParse(welcomeVideoUrl)) throw new Error("Enter a valid welcome video URL");
      if (calendlyUrl && !URL.canParse(calendlyUrl)) throw new Error("Enter a valid Calendly URL");
      const { error } = await (supabase as any).from("business_settings").update({
        onboarding_welcome_video_url: welcomeVideoUrl.trim() || null,
        onboarding_calendly_url: calendlyUrl.trim() || null,
      }).eq("id", settings.data!.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["onboarding-experience-settings"] }); toast.success("Onboarding experience updated"); },
    onError: (error: Error) => toast.error(error.message),
  });

  return <div className="mb-7 grid gap-5 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
    <div className="space-y-2"><Label className="flex items-center gap-2"><PlayCircle className="h-4 w-4 text-primary" />Welcome video URL</Label><Input value={welcomeVideoUrl} onChange={(event) => setWelcomeVideoUrl(event.target.value)} placeholder="https://.../welcome.mp4" /><p className="text-[11px] text-muted-foreground">Use a directly playable HTTPS video URL. Clients must watch 90% before continuing.</p></div>
    <div className="space-y-2"><Label className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" />Calendly onboarding URL</Label><Input value={calendlyUrl} onChange={(event) => setCalendlyUrl(event.target.value)} placeholder="https://calendly.com/..." /><p className="text-[11px] text-muted-foreground">Shown as the live-call alternative during onboarding.</p></div>
    <div className="sm:col-span-2 flex justify-end"><Button className="gap-2" disabled={!settings.data || save.isPending} onClick={() => save.mutate()}><Save className="h-4 w-4" />Save experience</Button></div>
  </div>;
}
