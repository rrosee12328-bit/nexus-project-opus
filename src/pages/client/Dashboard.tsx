import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, CheckCircle2, CreditCard, FileSignature, FolderKanban, Phone, Sparkles } from "lucide-react";
import AIAgentChat from "@/components/AIAgentChat";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const sourceIcons = {
  stripe: CreditCard,
  payment: CreditCard,
  fathom: Phone,
  zoom: Phone,
  proposal: FileSignature,
  project: FolderKanban,
  approval: CheckCircle2,
} as const;

export default function ClientDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [wizardDismissed, setWizardDismissed] = useState(false);

  const { data: clientId } = useQuery({
    queryKey: ["my-client-id", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_client_id_for_user", { _user_id: user!.id });
      if (error) throw error;
      return data as string | null;
    },
    enabled: !!user?.id,
  });

  const { data: profile } = useQuery({
    queryKey: ["client-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("display_name").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: onboardingSteps = [], isLoading: onboardingLoading } = useQuery({
    queryKey: ["onboarding-steps"],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_onboarding_steps").select("id, completed_at").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!clientId,
  });

  const { data: activity = [] } = useQuery({
    queryKey: ["client-activity", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_activity_feed")
        .select("id, source, event_type, title, summary, occurred_at")
        .eq("client_id", clientId!)
        .order("occurred_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!clientId,
  });

  useEffect(() => {
    if (!clientId) return;
    const channel = supabase
      .channel(`client-activity-${clientId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "client_activity_feed", filter: `client_id=eq.${clientId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["client-activity", clientId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, queryClient]);

  const displayName = profile?.display_name || user?.email?.split("@")[0] || "there";
  const onboardingComplete = onboardingSteps.length === 0 || onboardingSteps.every((step) => !!step.completed_at);
  const accountIsNew = user?.created_at ? Date.now() - new Date(user.created_at).getTime() < 7 * 86400000 : false;
  const showWizard = !wizardDismissed && accountIsNew && localStorage.getItem(`wizard_completed_${user?.id}`) !== "true";

  if (!onboardingLoading && !onboardingComplete) {
    return <div className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden bg-grid px-4 py-8 md:px-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-hero-glow" />
      <AnimatePresence>{showWizard && <OnboardingWizard onComplete={() => setWizardDismissed(true)} displayName={displayName} />}</AnimatePresence>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative mx-auto max-w-3xl space-y-7">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20"><Sparkles className="h-6 w-6 text-primary" /></div>
          <p className="kicker">Your Vektiss workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Let&apos;s get you fully connected, {displayName}.</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Complete these setup steps once. Your project assistant will then become your home for questions, updates, meeting notes, and next steps.</p>
        </div>
        <OnboardingChecklist />
      </motion.div>
    </div>;
  }

  return <div className="grid h-[calc(100dvh-3.5rem)] min-h-0 bg-grid xl:grid-cols-[minmax(0,1fr)_19rem]">
    <section className="min-h-0 border-r border-border/50 bg-background/80 backdrop-blur-sm">
      <AIAgentChat
        embedded
        title={`Welcome, ${displayName}`}
        subtitle="Ask about your project, what was decided in a meeting, your contract, billing, files, or what happens next."
        suggestions={[
          "What is the latest update on my project?",
          "What did we decide in our most recent call?",
          "What is my next milestone?",
          "Are my contract and payments up to date?",
        ]}
        sessionContext={{ page: "client home" }}
      />
    </section>
    <aside className="hidden min-h-0 overflow-y-auto bg-card/70 p-5 xl:block">
      <div className="mb-5 flex items-center gap-2"><BellRing className="h-4 w-4 text-primary" /><div><p className="text-sm font-semibold">What&apos;s new</p><p className="text-[11px] text-muted-foreground">Updates across your workspace</p></div></div>
      <div className="space-y-2.5">
        {activity.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-5 text-center"><Sparkles className="mx-auto mb-2 h-5 w-5 text-primary/50" /><p className="text-xs text-muted-foreground">Project and billing updates will appear here automatically.</p></div> : activity.map((event) => {
          const Icon = sourceIcons[event.source as keyof typeof sourceIcons] || Sparkles;
          return <motion.div key={event.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="rounded-2xl border border-border/70 bg-background/70 p-3.5 shadow-sm">
            <div className="flex gap-3"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Icon className="h-4 w-4 text-primary" /></div><div className="min-w-0"><p className="text-xs font-semibold leading-5">{event.title}</p>{event.summary && <p className="mt-0.5 line-clamp-3 text-[11px] leading-4 text-muted-foreground">{event.summary}</p>}<p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground/60">{formatDistanceToNow(new Date(event.occurred_at), { addSuffix: true })}</p></div></div>
          </motion.div>;
        })}
      </div>
    </aside>
  </div>;
}
