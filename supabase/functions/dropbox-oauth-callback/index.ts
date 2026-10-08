import { createClient } from "npm:@supabase/supabase-js@2";

const DROPBOX_TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const DROPBOX_ACCOUNT_URL = "https://api.dropboxapi.com/2/users/get_current_account";
const DROPBOX_SCOPES = "account_info.read files.metadata.read files.content.read sharing.read";

function appendParams(base: string, params: Record<string, string>) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } });
}

function basicAuth(clientId: string, clientSecret: string) {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

Deno.serve(async (req) => {
  const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "https://portal.vektiss.com";
  const fallbackRedirect = `${appBaseUrl.replace(/\/$/, "")}/admin/settings?tab=integrations`;

  try {
    const requestUrl = new URL(req.url);
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    const dropboxError = requestUrl.searchParams.get("error");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const clientId = Deno.env.get("DROPBOX_CLIENT_ID");
    const clientSecret = Deno.env.get("DROPBOX_CLIENT_SECRET");
    const redirectUri = Deno.env.get("DROPBOX_REDIRECT_URI");
    if (!supabaseUrl || !serviceRoleKey || !clientId || !clientSecret || !redirectUri) {
      return redirect(appendParams(fallbackRedirect, { dropbox: "error", reason: "missing-config" }));
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    if (!state) return redirect(appendParams(fallbackRedirect, { dropbox: "error", reason: "missing-state" }));

    const { data: stateRow, error: stateError } = await supabase
      .from("dropbox_video_review_oauth_states")
      .select("*")
      .eq("state", state)
      .is("used_at", null)
      .maybeSingle();

    if (stateError || !stateRow) return redirect(appendParams(fallbackRedirect, { dropbox: "error", reason: "invalid-state" }));
    const redirectTo = stateRow.redirect_to || fallbackRedirect;

    if (new Date(stateRow.expires_at).getTime() < Date.now()) {
      await supabase.from("dropbox_video_review_oauth_states").update({ used_at: new Date().toISOString() }).eq("id", stateRow.id);
      return redirect(appendParams(redirectTo, { dropbox: "error", reason: "expired-state" }));
    }

    if (dropboxError || !code) {
      await supabase.from("dropbox_video_review_oauth_states").update({ used_at: new Date().toISOString() }).eq("id", stateRow.id);
      return redirect(appendParams(redirectTo, { dropbox: "error", reason: dropboxError || "missing-code" }));
    }

    const tokenResponse = await fetch(DROPBOX_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: basicAuth(clientId, clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      await supabase.from("dropbox_video_review_oauth_states").update({ used_at: new Date().toISOString() }).eq("id", stateRow.id);
      return redirect(appendParams(redirectTo, { dropbox: "error", reason: "token-exchange" }));
    }

    const tokenData = await tokenResponse.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!tokenData.refresh_token) {
      await supabase.from("dropbox_video_review_oauth_states").update({ used_at: new Date().toISOString() }).eq("id", stateRow.id);
      return redirect(appendParams(redirectTo, { dropbox: "error", reason: "missing-offline-access" }));
    }

    const accountResponse = await fetch(DROPBOX_ACCOUNT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!accountResponse.ok) {
      await supabase.from("dropbox_video_review_oauth_states").update({ used_at: new Date().toISOString() }).eq("id", stateRow.id);
      return redirect(appendParams(redirectTo, { dropbox: "error", reason: "account-lookup" }));
    }

    const accountData = await accountResponse.json() as { account_id: string; name?: { display_name?: string } };
    const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null;

    const { error: disableError } = await supabase
      .from("dropbox_video_review_connections")
      .update({ is_active: false })
      .eq("is_active", true);
    if (disableError) return redirect(appendParams(redirectTo, { dropbox: "error", reason: "connection-save" }));

    const { error: connectionError } = await supabase.from("dropbox_video_review_connections").upsert({
      account_id: accountData.account_id,
      account_name: accountData.name?.display_name ?? null,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      scopes: (tokenData.scope ?? DROPBOX_SCOPES).split(" ").filter(Boolean),
      access_token_expires_at: expiresAt,
      connected_by: stateRow.user_id,
      connected_at: new Date().toISOString(),
      is_active: true,
    }, { onConflict: "account_id" });

    await supabase.from("dropbox_video_review_oauth_states").update({ used_at: new Date().toISOString() }).eq("id", stateRow.id);
    if (connectionError) return redirect(appendParams(redirectTo, { dropbox: "error", reason: "connection-save" }));

    return redirect(appendParams(redirectTo, { dropbox: "connected" }));
  } catch {
    return redirect(appendParams(fallbackRedirect, { dropbox: "error", reason: "unexpected" }));
  }
});
