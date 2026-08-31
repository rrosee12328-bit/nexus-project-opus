import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const INTUIT_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const QUICKBOOKS_SCOPE = "com.intuit.quickbooks.accounting";

type StartPayload = {
  redirectTo?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const clientId = Deno.env.get("QUICKBOOKS_CLIENT_ID");
    const redirectUri = Deno.env.get("QUICKBOOKS_REDIRECT_URI");
    const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "http://localhost:5173";
    const environment = Deno.env.get("QUICKBOOKS_ENVIRONMENT") ?? "sandbox";

    if (!supabaseUrl || !supabaseAnonKey || !clientId || !redirectUri) {
      return json({ error: "Missing QuickBooks or Supabase environment variables" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: req.headers.get("Authorization") ?? "",
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (roleError || !isAdmin) {
      return json({ error: "Forbidden" }, 403);
    }

    const payload = (await req.json().catch(() => ({}))) as StartPayload;
    const redirectTo = payload.redirectTo?.trim() || `${appBaseUrl}/admin/settings?tab=integrations`;
    const state = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase.from("quickbooks_oauth_states").insert({
      state,
      user_id: user.id,
      environment,
      redirect_to: redirectTo,
      expires_at: expiresAt,
    });

    if (insertError) {
      return json({ error: insertError.message }, 500);
    }

    const url = new URL(INTUIT_AUTHORIZE_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("scope", QUICKBOOKS_SCOPE);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);

    return json({ url: url.toString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});

