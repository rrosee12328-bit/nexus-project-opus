import { createClient } from "npm:@supabase/supabase-js@2";

const DROPBOX_AUTHORIZE_URL = "https://www.dropbox.com/oauth2/authorize";
const DROPBOX_SCOPES = "files.metadata.read files.content.read sharing.read";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type StartPayload = { redirectTo?: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeRedirect(value: string | undefined, appBaseUrl: string) {
  const fallback = `${appBaseUrl.replace(/\/$/, "")}/admin/settings?tab=integrations`;
  if (!value) return fallback;

  try {
    const candidate = new URL(value);
    const appBase = new URL(appBaseUrl);
    return candidate.origin === appBase.origin ? candidate.toString() : fallback;
  } catch {
    return fallback;
  }
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const clientId = Deno.env.get("DROPBOX_CLIENT_ID");
    const redirectUri = Deno.env.get("DROPBOX_REDIRECT_URI");
    const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "https://portal.vektiss.com";

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !clientId || !redirectUri) {
      return json({ error: "Dropbox import has not been configured yet. An admin needs to add the Dropbox OAuth secrets." }, 503);
    }

    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    if (!(await isAdmin(serviceClient, user.id))) return json({ error: "Only an admin can connect Dropbox" }, 403);

    const payload = (await req.json().catch(() => ({}))) as StartPayload;
    const state = crypto.randomUUID();
    const redirectTo = safeRedirect(payload.redirectTo, appBaseUrl);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { error: stateError } = await serviceClient.from("dropbox_video_review_oauth_states").insert({
      state,
      user_id: user.id,
      redirect_to: redirectTo,
      expires_at: expiresAt,
    });
    if (stateError) return json({ error: "Could not create the Dropbox authorization request" }, 500);

    const url = new URL(DROPBOX_AUTHORIZE_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("token_access_type", "offline");
    url.searchParams.set("scope", DROPBOX_SCOPES);
    url.searchParams.set("state", state);

    return json({ url: url.toString() });
  } catch {
    return json({ error: "Could not start Dropbox authorization" }, 500);
  }
});
