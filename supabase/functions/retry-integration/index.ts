import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Content-Type": "application/json" };
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);
    const { data: { user }, error } = await admin.auth.getUser((req.headers.get("Authorization") || "").replace(/^Bearer /, ""));
    if (error || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    if (!roles?.some(r => r.role === "admin")) return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers });
    const { run_id } = await req.json();
    const { data: run, error: runError } = await admin.from("integration_runs").select("*").eq("id", run_id).single();
    if (runError || !run || run.status !== "failed") return new Response(JSON.stringify({ error: "Only failed updates can be retried" }), { status: 409, headers });
    let response: Response;
    if (run.provider === "fathom") {
      response = await fetch(`${url}/functions/v1/fathom-sync`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` }, body: JSON.stringify({ call_id: run.external_id }) });
    } else if (run.provider === "stripe") {
      const stripeResponse = await fetch(`https://api.stripe.com/v1/events/${encodeURIComponent(run.external_id)}`, { headers: { Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}` } });
      if (!stripeResponse.ok) throw new Error("Could not retrieve the original Stripe event");
      const body = await stripeResponse.text();
      const timestamp = Math.floor(Date.now() / 1000);
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("STRIPE_WEBHOOK_SECRET")!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
      const hex = Array.from(new Uint8Array(signature)).map(byte => byte.toString(16).padStart(2, "0")).join("");
      response = await fetch(`${url}/functions/v1/stripe-webhook`, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": `t=${timestamp},v1=${hex}` }, body });
    } else throw new Error("Unsupported integration");
    const result = await response.json();
    if (!response.ok || result.error || result.results?.some((item: { error?: string }) => item.error)) throw new Error("Retry did not complete. Check integration details.");
    if (run.provider === "fathom" && !result.results?.length) throw new Error("The original meeting was not found. No time entry was changed.");
    return new Response(JSON.stringify({ success: true }), { headers });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Retry failed" }), { status: 500, headers });
  }
});
