import { supabase } from "@/integrations/supabase/client";

export async function logActivity(
  action: string,
  entityType: string,
  entityId: string | null,
  summary: string,
  metadata?: Record<string, unknown>
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("admin_activity_log" as any).insert({
      user_id: user.id,
      action,
      entity_type: entityType,
      entity_id: entityId,
      summary,
      metadata: metadata ?? null,
    } as any);
  } catch (err) {
    console.error("Activity log error:", err);
  }
}
