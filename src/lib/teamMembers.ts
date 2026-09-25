import { supabase } from "@/integrations/supabase/client";

export async function fetchTeamMembers() {
  const { data: roles, error } = await supabase.from("user_roles").select("user_id, role").in("role", ["admin", "ops"]);
  if (error) throw error;
  const ids = [...new Set((roles ?? []).map(row => row.user_id))];
  if (!ids.length) return [];
  const { data: profiles, error: profileError } = await supabase.from("profiles").select("user_id, display_name").in("user_id", ids);
  if (profileError) throw profileError;
  return ids.map(id => ({ id, name: profiles?.find(profile => profile.user_id === id)?.display_name || id.slice(0, 8), role: roles!.some(row => row.user_id === id && row.role === "admin") ? "admin" : "ops" }));
}
