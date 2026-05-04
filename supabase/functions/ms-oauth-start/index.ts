import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCOPES = "offline_access User.Read Calendars.ReadWrite";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const MS_CLIENT_ID = Deno.env.get("MS_CLIENT_ID");
    const MS_TENANT_ID = Deno.env.get("MS_TENANT_ID") || "common";
    if (!MS_CLIENT_ID) throw new Error("MS_CLIENT_ID missing");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const url = new URL(req.url);
    const returnTo = url.searchParams.get("return_to") || "/admin/calendar";
    const state = btoa(JSON.stringify({ uid: userRes.user.id, return_to: returnTo, n: crypto.randomUUID() }));

    const redirect_uri = `${SUPABASE_URL}/functions/v1/ms-oauth-callback`;
    const authUrl = new URL(`https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/authorize`);
    authUrl.searchParams.set("client_id", MS_CLIENT_ID);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", redirect_uri);
    authUrl.searchParams.set("response_mode", "query");
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("prompt", "select_account");

    return new Response(JSON.stringify({ url: authUrl.toString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});