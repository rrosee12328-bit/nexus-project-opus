import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const APP_ORIGIN = "https://portal.vektiss.com";

Deno.serve(async (req) => {
  try {
    const MS_CLIENT_ID = Deno.env.get("MS_CLIENT_ID")!;
    const MS_CLIENT_SECRET = Deno.env.get("MS_CLIENT_SECRET")!;
    const MS_TENANT_ID = Deno.env.get("MS_TENANT_ID") || "common";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    const err = url.searchParams.get("error_description") || url.searchParams.get("error");
    if (err) return Response.redirect(`${APP_ORIGIN}/admin/calendar?ms_error=${encodeURIComponent(err)}`, 302);
    if (!code || !stateRaw) return new Response("Missing code/state", { status: 400 });

    let state: { uid: string; return_to: string };
    try { state = JSON.parse(atob(stateRaw)); } catch { return new Response("Bad state", { status: 400 }); }

    const redirect_uri = `${SUPABASE_URL}/functions/v1/ms-oauth-callback`;
    const tokenRes = await fetch(`https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        code,
        redirect_uri,
        grant_type: "authorization_code",
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("token exchange failed", tokenJson);
      return Response.redirect(`${APP_ORIGIN}${state.return_to}?ms_error=${encodeURIComponent(tokenJson.error_description || "token_exchange_failed")}`, 302);
    }

    // Fetch user info
    const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const me = await meRes.json();

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const expiresAt = new Date(Date.now() + (tokenJson.expires_in - 60) * 1000).toISOString();

    await admin.from("ms_outlook_tokens").upsert({
      user_id: state.uid,
      ms_user_id: me?.id || null,
      ms_email: me?.mail || me?.userPrincipalName || null,
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      expires_at: expiresAt,
      scope: tokenJson.scope || null,
    }, { onConflict: "user_id" });

    return Response.redirect(`${APP_ORIGIN}${state.return_to}?ms_connected=1`, 302);
  } catch (e) {
    console.error(e);
    return new Response(`Error: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
});