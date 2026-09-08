import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { ArrowRight, BellRing, CheckCircle2, CreditCard, FileSignature, FolderKanban, MessageSquare, Phone, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import AIAgentChat from "@/components/AIAgentChat";
import { ClientOnboardingExperience } from "@/components/onboarding/ClientOnboardingExperience";
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

const sourceRoutes: Record<string, string> = {
  stripe: "/portal/billing",
  payment: "/portal/billing",
  fathom: "/portal/calls",
  zoom: "/portal/calls",
  proposal: "/portal/contracts",
  project: "/portal/projects",
  approval: "/portal/approvals",
};

const formatCurrency = (cents: number) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
}).format(cents / 100);

export default function ClientDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

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

  const { data: clientStatus, isLoading: clientStatusLoading } = useQuery({
    queryKey: ["client-onboarding-status", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("status").eq("id", clientId!).single();
      if (error) throw error;
      return data.status;
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

  const { data: briefing } = useQuery({
    queryKey: ["client-briefing", clientId, user?.id],
    queryFn: async () => {
      const [approvals, messages, invoices, projects] = await Promise.all([
        supabase.from("approval_requests").select("id, title", { count: "exact" }).eq("client_id", clientId!).eq("status", "pending"),
        supabase.from("messages").select("id", { count: "exact", head: true }).eq("client_id", clientId!).neq("sender_id", user!.id).is("read_at", null),
        supabase.from("stripe_invoices").select("amount_due, amount_paid, status").eq("client_id", clientId!).in("status", ["open", "past_due"]),
        supabase.from("projects").select("id, name, current_phase, progress, progress_percentage, target_date").eq("client_id", clientId!).in("status", ["not_started", "in_progress"]).order("updated_at", { ascending: false }).limit(1),
      ]);
      const error = approvals.error || messages.error || invoices.error || projects.error;
      if (error) throw error;
      return {
        pendingApprovals: approvals.count ?? approvals.data?.length ?? 0,
        unreadMessages: messages.count ?? 0,
        outstandingBalance: (invoices.data ?? []).reduce((sum, invoice) => sum + Math.max(0, invoice.amount_due - invoice.amount_paid), 0),
        activeProject: projects.data?.[0] ?? null,
      };
    },
    enabled: !!clientId && !!user?.id,
  });

  useEffect(() => {
    if (!clientId) return;
    const channel = supabase
      .channel(`client-activity-${clientId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "client_activity_feed", filter: `client_id=eq.${clientId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["client-activity", clientId] });
        queryClient.invalidateQueries({ queryKey: ["client-briefing", clientId, user?.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `client_id=eq.${clientId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["client-briefing", clientId, user?.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, queryClient, user?.id]);

  const displayName = profile?.display_name || user?.email?.split("@")[0] || "there";
  const onboardingComplete = clientStatus !== "onboarding" && (onboardingSteps.length === 0 || onboardingSteps.every((step) => !!step.completed_at));
  const attentionItems = [
    briefing?.pendingApprovals ? {
      label: `${briefing.pendingApprovals} approval${briefing.pendingApprovals === 1 ? "" : "s"} waiting`,
      detail: "Review and respond",
      route: "/portal/approvals",
      icon: CheckCircle2,
    } : null,
    briefing?.outstandingBalance ? {
      label: `${formatCurrency(briefing.outstandingBalance)} due`,
      detail: "Review billing",
      route: "/portal/billing",
      icon: CreditCard,
    } : null,
    briefing?.unreadMessages ? {
      label: `${briefing.unreadMessages} unread message${briefing.unreadMessages === 1 ? "" : "s"}`,
      detail: "Open conversation",
      route: "/portal/messages",
      icon: MessageSquare,
    } : null,
  ].filter(Boolean) as Array<{ label: string; detail: string; route: string; icon: typeof CheckCircle2 }>;

  if (!onboardingLoading && !clientStatusLoading && !onboardingComplete) {
    return <ClientOnboardingExperience onComplete={() => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-steps"] });
      queryClient.invalidateQueries({ queryKey: ["client-onboarding-status", clientId] });
    }} />;
  }

  return <div className="grid h-[calc(100dvh-3.5rem)] min-h-0 bg-grid xl:grid-cols-[minmax(0,1fr)_19rem]">
    <section className="flex min-h-0 flex-col border-r border-border/50 bg-background/80 backdrop-blur-sm">
      <div className="shrink-0 border-b border-border/50 bg-card/75 px-3 py-3 md:px-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold">Your brief</p>
            <p className="text-[11px] text-muted-foreground">What needs your attention right now</p>
          </div>
          <Link to="/portal/messages" className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
            Ask your team <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {attentionItems.length === 0 && <div className="flex min-w-52 items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            <div><p className="text-xs font-medium">You&apos;re all caught up</p><p className="text-[10px] text-muted-foreground">No action is needed right now</p></div>
          </div>}
          {attentionItems.map((item) => <Link key={item.route} to={item.route} className="group flex min-w-52 items-center gap-2 rounded-xl border border-border/70 bg-background/80 px-3 py-2 transition-colors hover:border-primary/30 hover:bg-primary/5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10"><item.icon className="h-4 w-4 text-primary" /></div>
            <div className="min-w-0"><p className="truncate text-xs font-semibold">{item.label}</p><p className="text-[10px] text-muted-foreground">{item.detail}</p></div>
            <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>)}
          {briefing?.activeProject && <Link to="/portal/projects" className="group flex min-w-56 items-center gap-2 rounded-xl border border-border/70 bg-background/80 px-3 py-2 transition-colors hover:border-primary/30 hover:bg-primary/5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10"><FolderKanban className="h-4 w-4 text-primary" /></div>
            <div className="min-w-0"><p className="truncate text-xs font-semibold">{briefing.activeProject.name}</p><p className="truncate text-[10px] capitalize text-muted-foreground">{briefing.activeProject.current_phase} · {briefing.activeProject.progress_percentage ?? briefing.activeProject.progress}% complete</p></div>
            <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <AIAgentChat
          embedded
          title={`Welcome, ${displayName}`}
          subtitle="Ask about your project, what was decided in a meeting, your contract, billing, files, or what happens next."
          suggestions={[
            "What needs my attention today?",
            "What did we decide in our most recent call?",
            "What is my next milestone?",
            "Are my contract and payments up to date?",
          ]}
          sessionContext={{ page: "client home" }}
        />
      </div>
    </section>
    <aside className="hidden min-h-0 overflow-y-auto bg-card/70 p-5 xl:block">
      <div className="mb-5 flex items-center gap-2"><BellRing className="h-4 w-4 text-primary" /><div><p className="text-sm font-semibold">What&apos;s new</p><p className="text-[11px] text-muted-foreground">Updates across your workspace</p></div></div>
      <div className="space-y-2.5">
        {activity.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-5 text-center"><Sparkles className="mx-auto mb-2 h-5 w-5 text-primary/50" /><p className="text-xs text-muted-foreground">Project and billing updates will appear here automatically.</p></div> : activity.map((event) => {
          const Icon = sourceIcons[event.source as keyof typeof sourceIcons] || Sparkles;
          return <motion.div key={event.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
            <Link to={sourceRoutes[event.source] || "/portal/projects"} className="block rounded-2xl border border-border/70 bg-background/70 p-3.5 shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5">
            <div className="flex gap-3"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Icon className="h-4 w-4 text-primary" /></div><div className="min-w-0"><p className="text-xs font-semibold leading-5">{event.title}</p>{event.summary && <p className="mt-0.5 line-clamp-3 text-[11px] leading-4 text-muted-foreground">{event.summary}</p>}<p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground/60">{formatDistanceToNow(new Date(event.occurred_at), { addSuffix: true })}</p></div></div>
            </Link>
          </motion.div>;
        })}
      </div>
    </aside>
  </div>;
}
