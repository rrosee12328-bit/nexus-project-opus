import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

export async function authorizedStaff(req: Request, roles = ["admin", "ops"]): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: assigned, error: roleError } = await admin.from("user_roles").select("role").eq("user_id", data.user.id);
  return !roleError && assigned?.some(r => roles.includes(r.role)) ? data.user.id : null;
}
