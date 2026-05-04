import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth header");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) throw new Error("Unauthorized");
    const { data: roleRow } = await userClient
      .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Admin role required");

    const { milestone_id, days_until_due = 14 } = await req.json();
    if (!milestone_id) throw new Error("milestone_id is required");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: ms, error: msErr } = await admin
      .from("phase_milestone_invoices")
      .select("id, client_id, project_id, phase, pct, amount, status, stripe_invoice_id")
      .eq("id", milestone_id)
      .single();
    if (msErr || !ms) throw new Error("Milestone not found");
    if (ms.status !== "pending") throw new Error(`Milestone is already ${ms.status}`);

    const { data: client, error: clientErr } = await admin
      .from("clients")
      .select("id, name, email, stripe_customer_id, billing_paused_until")
      .eq("id", ms.client_id).single();
    if (clientErr || !client) throw new Error("Client not found");
    if (!client.email) throw new Error("Client has no email — add one before invoicing");
    if (client.billing_paused_until && new Date(client.billing_paused_until) > new Date()) {
      throw new Error("Billing is paused for this client");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" as any });

    let customerId = client.stripe_customer_id;
    if (!customerId) {
      const existing = await stripe.customers.list({ email: client.email, limit: 1 });
      customerId = existing.data[0]?.id ?? (await stripe.customers.create({
        email: client.email, name: client.name, metadata: { client_id: client.id },
      })).id;
      await admin.from("clients").update({ stripe_customer_id: customerId }).eq("id", client.id);
    }

    const phaseLabel = ms.phase.charAt(0).toUpperCase() + ms.phase.slice(1);
    const description = `${phaseLabel} milestone — ${ms.pct}% of project setup`;

    const invoice = await stripe.invoices.create({
      customer: customerId!,
      collection_method: "send_invoice",
      days_until_due,
      auto_advance: false,
      description,
      metadata: {
        milestone_id: ms.id,
        client_id: client.id,
        project_id: ms.project_id ?? "",
        phase: ms.phase,
      },
    });

    await stripe.invoiceItems.create({
      customer: customerId!,
      invoice: invoice.id,
      currency: "usd",
      amount: Math.round(Number(ms.amount) * 100),
      description,
    });

    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    await stripe.invoices.sendInvoice(finalized.id).catch(() => {});

    await admin.from("phase_milestone_invoices").update({
      status: "invoiced",
      stripe_invoice_id: finalized.id,
      invoiced_at: new Date().toISOString(),
    }).eq("id", ms.id);

    return new Response(JSON.stringify({
      ok: true,
      invoice_id: finalized.id,
      hosted_invoice_url: finalized.hosted_invoice_url,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (err: any) {
    console.error("create-milestone-invoice error", err);
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
    });
  }
});