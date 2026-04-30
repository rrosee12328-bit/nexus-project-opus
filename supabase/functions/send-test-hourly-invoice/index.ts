import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Admin role required");

    const { hourly_invoice_id, test_email } = await req.json();
    if (!hourly_invoice_id) throw new Error("hourly_invoice_id required");
    const recipient = (test_email || userData.user.email || "").trim();
    if (!recipient) throw new Error("No test email provided");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: header, error: hErr } = await admin
      .from("hourly_invoices")
      .select("*, clients(name)")
      .eq("id", hourly_invoice_id)
      .single();
    if (hErr || !header) throw new Error("Source invoice not found");
    if (!header.stripe_invoice_id) throw new Error("Source invoice has no Stripe record");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" as any });

    // Pull line items from the source Stripe invoice
    const source = await stripe.invoices.retrieve(header.stripe_invoice_id, {
      expand: ["lines.data"],
    });
    const lines = (source.lines?.data ?? []).map((l: any) => ({
      description: `[TEST] ${l.description ?? "Line"}`,
      amount: l.amount ?? 0,
    }));
    if (!lines.length) throw new Error("No line items to test with");

    // Find or create a Stripe customer for the test recipient
    const existing = await stripe.customers.list({ email: recipient, limit: 1 });
    const testCustomer = existing.data.length
      ? existing.data[0]
      : await stripe.customers.create({
          email: recipient,
          name: `TEST — ${header.clients?.name ?? "Invoice preview"}`,
          metadata: { vektiss_test: "true" },
        });

    // Create test invoice
    const testInvoice = await stripe.invoices.create({
      customer: testCustomer.id,
      collection_method: "send_invoice",
      days_until_due: 30,
      auto_advance: false,
      description: `TEST PREVIEW — copy of invoice for ${header.clients?.name ?? "client"}. Do not pay.`,
      metadata: {
        vektiss_test: "true",
        source_hourly_invoice_id: header.id,
      },
    });

    for (const line of lines) {
      await stripe.invoiceItems.create({
        customer: testCustomer.id,
        invoice: testInvoice.id,
        currency: source.currency ?? "usd",
        amount: line.amount,
        description: line.description,
      });
    }

    const finalized = await stripe.invoices.finalizeInvoice(testInvoice.id);
    try {
      await stripe.invoices.sendInvoice(testInvoice.id);
    } catch (e) {
      console.warn("test sendInvoice failed:", e);
    }
    const fresh = await stripe.invoices.retrieve(testInvoice.id);

    return new Response(
      JSON.stringify({
        sent_to: recipient,
        stripe_invoice_id: fresh.id,
        hosted_invoice_url: fresh.hosted_invoice_url,
        invoice_pdf: fresh.invoice_pdf,
        number: fresh.number,
        status: fresh.status,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    console.error("send-test-hourly-invoice error:", err);
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});