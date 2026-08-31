import { createClient } from "npm:@supabase/supabase-js@2";

const INTUIT_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const SANDBOX_API_BASE = "https://sandbox-quickbooks.api.intuit.com";
const PRODUCTION_API_BASE = "https://quickbooks.api.intuit.com";

function appendParams(base: string, params: Record<string, string>) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function redirect(location: string) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
    },
  });
}

Deno.serve(async (req) => {
  try {
    const requestUrl = new URL(req.url);
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    const realmId = requestUrl.searchParams.get("realmId");
    const intuitError = requestUrl.searchParams.get("error");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const clientId = Deno.env.get("QUICKBOOKS_CLIENT_ID");
    const clientSecret = Deno.env.get("QUICKBOOKS_CLIENT_SECRET");
    const redirectUri = Deno.env.get("QUICKBOOKS_REDIRECT_URI");
    const fallbackRedirect = Deno.env.get("APP_BASE_URL") ?? "http://localhost:5173/admin/settings?tab=integrations";

    if (!supabaseUrl || !serviceRoleKey || !clientId || !clientSecret || !redirectUri) {
      return redirect(appendParams(fallbackRedirect, { quickbooks: "error", reason: "missing-env" }));
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (!state) {
      return redirect(appendParams(fallbackRedirect, { quickbooks: "error", reason: "missing-state" }));
    }

    const { data: stateRow, error: stateError } = await supabase
      .from("quickbooks_oauth_states")
      .select("*")
      .eq("state", state)
      .is("used_at", null)
      .maybeSingle();

    if (stateError || !stateRow) {
      return redirect(appendParams(fallbackRedirect, { quickbooks: "error", reason: "invalid-state" }));
    }

    const redirectTo = stateRow.redirect_to || fallbackRedirect;

    if (stateRow.expires_at && new Date(stateRow.expires_at).getTime() < Date.now()) {
      return redirect(appendParams(redirectTo, { quickbooks: "error", reason: "expired-state" }));
    }

    if (intuitError || !code || !realmId) {
      await supabase
        .from("quickbooks_oauth_states")
        .update({ used_at: new Date().toISOString() })
        .eq("id", stateRow.id);

      return redirect(
        appendParams(redirectTo, {
          quickbooks: "error",
          reason: intuitError || "missing-code",
        }),
      );
    }

    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    const tokenResponse = await fetch(INTUIT_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenBody.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      await supabase
        .from("quickbooks_oauth_states")
        .update({ used_at: new Date().toISOString() })
        .eq("id", stateRow.id);

      return redirect(
        appendParams(redirectTo, {
          quickbooks: "error",
          reason: tokenResponse.status.toString(),
          detail: errorText.slice(0, 120),
        }),
      );
    }

    const tokenData = await tokenResponse.json() as {
      access_token: string;
      refresh_token: string;
      expires_in?: number;
      x_refresh_token_expires_in?: number;
    };

    const apiBase = stateRow.environment === "production" ? PRODUCTION_API_BASE : SANDBOX_API_BASE;
    let companyName: string | null = null;

    try {
      const infoResponse = await fetch(
        `${apiBase}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=75`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        },
      );

      if (infoResponse.ok) {
        const infoData = await infoResponse.json() as {
          CompanyInfo?: {
            CompanyName?: string;
            LegalName?: string;
          };
        };
        companyName = infoData.CompanyInfo?.CompanyName ?? infoData.CompanyInfo?.LegalName ?? null;
      }
    } catch {
      // Company info is nice-to-have; keep the OAuth handshake resilient.
    }

    const now = Date.now();
    const accessTokenExpiresAt = tokenData.expires_in
      ? new Date(now + tokenData.expires_in * 1000).toISOString()
      : null;
    const refreshTokenExpiresAt = tokenData.x_refresh_token_expires_in
      ? new Date(now + tokenData.x_refresh_token_expires_in * 1000).toISOString()
      : null;

    const { error: upsertError } = await supabase.from("quickbooks_connections").upsert({
      environment: stateRow.environment,
      realm_id: realmId,
      company_name: companyName,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      scopes: [QUICKBOOKS_SCOPE],
      access_token_expires_at: accessTokenExpiresAt,
      refresh_token_expires_at: refreshTokenExpiresAt,
      connected_by: stateRow.user_id,
      is_active: true,
    }, {
      onConflict: "environment,realm_id",
    });

    if (upsertError) {
      await supabase
        .from("quickbooks_oauth_states")
        .update({ used_at: new Date().toISOString() })
        .eq("id", stateRow.id);

      return redirect(
        appendParams(redirectTo, {
          quickbooks: "error",
          reason: "db-write",
        }),
      );
    }

    await supabase
      .from("quickbooks_oauth_states")
      .update({ used_at: new Date().toISOString() })
      .eq("id", stateRow.id);

    return redirect(appendParams(redirectTo, { quickbooks: "connected" }));
  } catch (error) {
    const fallbackRedirect = Deno.env.get("APP_BASE_URL") ?? "http://localhost:5173/admin/settings?tab=integrations";
    const message = error instanceof Error ? error.message.slice(0, 120) : "unexpected";
    return redirect(appendParams(fallbackRedirect, { quickbooks: "error", reason: message }));
  }
});

const QUICKBOOKS_SCOPE = "com.intuit.quickbooks.accounting";

