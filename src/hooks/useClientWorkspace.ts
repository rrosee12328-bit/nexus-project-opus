import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { meetingTime } from "@/lib/meetingTime";

type UpcomingCall = { id: string; title: string; start_time: string; external_starts_at?: string; event_timezone?: string };

export function useClientWorkspace(clientId: string) {
  const cache = useQueryClient();
  useEffect(() => {
    const channel = supabase.channel(`workspace-${clientId}`);
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "clients", filter: `id=eq.${clientId}` }, () => {
      void cache.invalidateQueries({ queryKey: ["client-workspace", clientId] });
      void cache.invalidateQueries({ queryKey: ["client", clientId] });
    });
    for (const table of ["projects", "proposals", "time_entries", "calendar_events", "client_action_items", "onboarding_sessions", "messages", "stripe_invoices"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `client_id=eq.${clientId}` }, () => {
        void cache.invalidateQueries({ queryKey: ["client-workspace", clientId] });
      });
    }
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [clientId, cache]);
  return useQuery({
    queryKey: ["client-workspace", clientId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const [projects, proposals, time, calls, actions, session, messages, client] = await Promise.all([
        supabase.from("projects").select("id, name, status, progress, target_date").eq("client_id", clientId).order("updated_at", { ascending: false }),
        supabase.from("proposals").select("*").or(`client_id.eq.${clientId},converted_to_client_id.eq.${clientId}`).order("created_at", { ascending: false }),
        supabase.from("time_entries").select("id, hours, description, entry_date, project_id").eq("client_id", clientId).order("entry_date", { ascending: false }).limit(100),
        supabase.from("calendar_events").select("*").eq("client_id", clientId).is("cancelled_at", null).in("event_type", ["calendly", "meeting", "call"]).gte("start_time", new Date().toISOString()).order("start_time").limit(3),
        supabase.from("client_action_items" as never).select("id, title, status, due_at").eq("client_id", clientId).in("status", ["pending", "awaiting_review"]).order("due_at", { nullsFirst: false }).limit(5),
        supabase.from("onboarding_sessions" as never).select("completed_at, status").eq("client_id", clientId).maybeSingle(),
        supabase.from("messages").select("id, content, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(10),
        supabase.from("clients").select("setup_fee, setup_paid").eq("id", clientId).single(),
      ]);
      for (const result of [projects, proposals, time, calls, actions, session, messages, client]) if (result.error) throw result.error;
      return {
        clientCredit: client.data,
        projects: projects.data ?? [], proposals: proposals.data ?? [], time: time.data ?? [],
        calls: ((calls.data ?? []) as UpcomingCall[]).map(call => ({ ...call, displayTime: meetingTime(call.external_starts_at || call.start_time, call.event_timezone) })),
        messages: messages.data ?? [],
        actions: (actions.data ?? []) as unknown as Array<{ id: string; title: string; status: string; due_at: string | null }>,
        session: session.data as unknown as { completed_at: string | null; status: string } | null,
      };
    },
    enabled: !!clientId,
  });
}
