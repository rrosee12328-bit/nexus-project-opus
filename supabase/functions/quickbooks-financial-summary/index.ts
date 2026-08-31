import { createClient } from "npm:@supabase/supabase-js@2";

const INTUIT_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const PRODUCTION_API_BASE = "https://quickbooks.api.intuit.com";
const SANDBOX_API_BASE = "https://sandbox-quickbooks.api.intuit.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function reportTotal(rows: any[], group: string) {
  const row = rows.find((item) => item?.group === group);
  return numeric(row?.Summary?.ColData?.[1]?.value);
}

function monthPeriods(startDate: string, endDate: string) {
  const periods: Array<{ month: number; year: number; startDate: string; endDate: string }> = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  cursor.setUTCDate(1);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    periods.push({
      month,
      year,
      startDate: monthStart < startDate ? startDate : monthStart,
      endDate: monthEnd > endDate ? endDate : monthEnd,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return periods;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const clientId = Deno.env.get("QUICKBOOKS_CLIENT_ID");
    const clientSecret = Deno.env.get("QUICKBOOKS_CLIENT_SECRET");
    const proxyUrl = Deno.env.get("QUICKBOOKS_PROXY_URL")?.replace(/\/$/, "");
    const proxyToken = Deno.env.get("QUICKBOOKS_PROXY_TOKEN");
    const authorization = req.headers.get("Authorization");

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !clientId || !clientSecret || !authorization) {
      return json({ error: "Missing required configuration" }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Admin access required" }, 403);

    const body = await req.json().catch(() => ({}));
    const startDate = String(body.startDate ?? "");
    const endDate = String(body.endDate ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return json({ error: "startDate and endDate must use YYYY-MM-DD" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: connection, error: connectionError } = await admin
      .from("quickbooks_connections")
      .select("*")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (connectionError) throw connectionError;
    if (!connection) return json({ connected: false, error: "QuickBooks is not connected" }, 409);

    let accessToken = connection.access_token as string;
    const expiresAt = connection.access_token_expires_at
      ? new Date(connection.access_token_expires_at).getTime()
      : 0;

    if (!expiresAt || expiresAt <= Date.now() + 60_000) {
      const basicAuth = btoa(`${clientId}:${clientSecret}`);
      const tokenEndpoint = proxyUrl && proxyToken ? `${proxyUrl}/oauth/token` : INTUIT_TOKEN_URL;
      const tokenHeaders: Record<string, string> = {
        Accept: "application/json",
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      };
      if (proxyUrl && proxyToken) {
        tokenHeaders.Authorization = `Bearer ${proxyToken}`;
        tokenHeaders["X-Upstream-Accept"] = "application/json";
        tokenHeaders["X-Upstream-Authorization"] = `Basic ${basicAuth}`;
        tokenHeaders["X-Upstream-Content-Type"] = "application/x-www-form-urlencoded";
      }

      const refreshResponse = await fetch(tokenEndpoint, {
        method: "POST",
        headers: tokenHeaders,
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: connection.refresh_token,
        }).toString(),
      });

      if (!refreshResponse.ok) {
        console.error("QuickBooks refresh failed", {
          status: refreshResponse.status,
          intuitTid: refreshResponse.headers.get("intuit_tid"),
        });
        return json({ connected: true, error: "QuickBooks authorization expired. Reconnect QuickBooks." }, 401);
      }

      const refreshed = await refreshResponse.json() as {
        access_token: string;
        refresh_token: string;
        expires_in?: number;
        x_refresh_token_expires_in?: number;
      };
      accessToken = refreshed.access_token;
      const now = Date.now();
      await admin.from("quickbooks_connections").update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        access_token_expires_at: refreshed.expires_in
          ? new Date(now + refreshed.expires_in * 1000).toISOString()
          : null,
        refresh_token_expires_at: refreshed.x_refresh_token_expires_in
          ? new Date(now + refreshed.x_refresh_token_expires_in * 1000).toISOString()
          : connection.refresh_token_expires_at,
      }).eq("id", connection.id);
    }

    const apiBase = connection.environment === "production" ? PRODUCTION_API_BASE : SANDBOX_API_BASE;
    const reportHeaders: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    };
    if (proxyUrl && proxyToken) {
      reportHeaders.Authorization = `Bearer ${proxyToken}`;
      reportHeaders["X-Upstream-Accept"] = "application/json";
      reportHeaders["X-Upstream-Authorization"] = `Bearer ${accessToken}`;
    }

    const fetchReport = async (periodStart = startDate, periodEnd = endDate) => {
      const reportPath = `/v3/company/${connection.realm_id}/reports/ProfitAndLoss?start_date=${encodeURIComponent(periodStart)}&end_date=${encodeURIComponent(periodEnd)}&accounting_method=Accrual&minorversion=75`;
      const reportUrl = proxyUrl && proxyToken
        ? `${proxyUrl}/qbo${reportPath}`
        : `${apiBase}${reportPath}`;
      return fetch(reportUrl, { headers: reportHeaders });
    };

    const periods = monthPeriods(startDate, endDate);
    const [reportResponse, monthlyResponses] = await Promise.all([
      fetchReport(),
      Promise.all(periods.map((period) => fetchReport(period.startDate, period.endDate))),
    ]);
    if (!reportResponse.ok) {
      console.error("QuickBooks P&L failed", {
        status: reportResponse.status,
        intuitTid: reportResponse.headers.get("intuit_tid"),
      });
      return json({ connected: true, error: "QuickBooks could not return the Profit & Loss report" }, 502);
    }

    const report = await reportResponse.json() as any;
    const rows = report?.Rows?.Row ?? [];
    const income = reportTotal(rows, "Income");
    const costOfGoodsSold = reportTotal(rows, "COGS");
    const expenses = reportTotal(rows, "Expenses");
    const otherIncome = reportTotal(rows, "OtherIncome");
    const otherExpenses = reportTotal(rows, "OtherExpenses");
    const netIncome = numeric(
      rows.find((item: any) => item?.group === "NetIncome")?.Summary?.ColData?.[1]?.value,
    ) || income + otherIncome - costOfGoodsSold - expenses - otherExpenses;

    const monthlyRevenue = await Promise.all(periods.map(async (period, index) => {
      const response = monthlyResponses[index];
      if (!response.ok) {
        console.error("QuickBooks monthly P&L failed", {
          month: period.month,
          year: period.year,
          status: response.status,
          intuitTid: response.headers.get("intuit_tid"),
        });
        return { month: period.month, year: period.year, revenue: 0, expenses: 0, netIncome: 0 };
      }
      const monthlyReport = await response.json() as any;
      const monthlyRows = monthlyReport?.Rows?.Row ?? [];
      const revenue = reportTotal(monthlyRows, "Income") + reportTotal(monthlyRows, "OtherIncome");
      const monthlyExpenses = reportTotal(monthlyRows, "COGS")
        + reportTotal(monthlyRows, "Expenses")
        + reportTotal(monthlyRows, "OtherExpenses");
      const reportedNetIncome = numeric(
        monthlyRows.find((item: any) => item?.group === "NetIncome")?.Summary?.ColData?.[1]?.value,
      );
      return {
        month: period.month,
        year: period.year,
        revenue,
        expenses: monthlyExpenses,
        netIncome: reportedNetIncome || revenue - monthlyExpenses,
      };
    }));

    return json({
      connected: true,
      companyName: connection.company_name,
      environment: connection.environment,
      startDate,
      endDate,
      accountingMethod: "Accrual",
      income,
      costOfGoodsSold,
      expenses,
      otherIncome,
      otherExpenses,
      netIncome,
      monthlyRevenue,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("QuickBooks financial summary failed", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
