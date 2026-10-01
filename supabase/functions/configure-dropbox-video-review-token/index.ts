import { createClient } from "npm:@supabase/supabase-js@2";

const DROPBOX_ACCOUNT_URL = "https://api.dropboxapi.com/2/users/get_current_account";
const DROPBOX_LIST_FOLDER_URL = "https://api.dropboxapi.com/2/files/list_folder";
const DROPBOX_LIST_SHARED_LINKS_URL = "https://api.dropboxapi.com/2/sharing/list_shared_links";
const DROPBOX_TEMPORARY_LINK_URL = "https://api.dropboxapi.com/2/files/get_temporary_link";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ConfigurePayload = { accessToken?: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function isAdmin(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  return !error && Boolean(data);
}

async function dropboxPost(url: string, accessToken: string, body: Record<string, unknown>) {
  return fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Dropbox connection service is unavailable." }, 503);

    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    if (!(await isAdmin(serviceClient, user.id))) return json({ error: "Only an admin can connect Dropbox" }, 403);

    const payload = (await req.json().catch(() => ({}))) as ConfigurePayload;
    const accessToken = payload.accessToken?.trim() ?? "";
    if (accessToken.length < 40) return json({ error: "Enter a valid Dropbox access token." }, 400);

    const accountResponse = await dropboxPost(DROPBOX_ACCOUNT_URL, accessToken, {});
    if (!accountResponse.ok) return json({ error: "Dropbox rejected that access token." }, 422);
    const account = await accountResponse.json() as { account_id: string; name?: { display_name?: string } };

    // Confirm title imports plus the content scope used to stream videos inside
    // the branded Vektiss review player. An intentionally missing path gives a
    // normal Dropbox path error when the content scope is present.
    const [filesResponse, sharingResponse, contentScopeResponse] = await Promise.all([
      dropboxPost(DROPBOX_LIST_FOLDER_URL, accessToken, { path: "", recursive: false, include_deleted: false, limit: 1 }),
      dropboxPost(DROPBOX_LIST_SHARED_LINKS_URL, accessToken, { direct_only: true }),
      dropboxPost(DROPBOX_TEMPORARY_LINK_URL, accessToken, { path: "/__vektiss_scope_check__" }),
    ]);
    const contentScopePayload = await contentScopeResponse.clone().json().catch(() => ({})) as { error_summary?: string };
    const contentScopeMissing = contentScopePayload.error_summary?.includes("missing_scope") || contentScopePayload.error_summary?.includes("insufficient_scope");
    if (!filesResponse.ok || !sharingResponse.ok || contentScopeMissing) {
      return json({ error: "Enable files.metadata.read, files.content.read, and sharing.read in the Dropbox App Console, generate a new access token, then try again." }, 422);
    }

    const { error: disableError } = await serviceClient
      .from("dropbox_video_review_connections")
      .update({ is_active: false })
      .eq("is_active", true);
    if (disableError) return json({ error: "Could not save the Dropbox connection." }, 500);

    const { error: saveError } = await serviceClient.from("dropbox_video_review_connections").upsert({
      account_id: account.account_id,
      account_name: account.name?.display_name ?? null,
      access_token: accessToken,
      refresh_token: "",
      scopes: ["files.metadata.read", "files.content.read", "sharing.read"],
      access_token_expires_at: null,
      connected_by: user.id,
      connected_at: new Date().toISOString(),
      is_active: true,
    }, { onConflict: "account_id" });
    if (saveError) return json({ error: "Could not save the Dropbox connection." }, 500);

    return json({ connected: true, accountName: account.name?.display_name ?? null });
  } catch {
    return json({ error: "Could not connect Dropbox." }, 500);
  }
});
