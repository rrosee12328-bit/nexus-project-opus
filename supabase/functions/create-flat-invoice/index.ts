import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface LineItem {
  description: string;
  amount: number; // dollars
}

interface Body {
  client_id: string;
  line_items: LineItem[];
  notes?: string;
  days_until_due?: number;
  auto_finalize?: boolean;
}

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
    const userId = userData.user.id;

    const { data: roleRow } = await userClient
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Admin role required");

    const body: Body = await req.json();
    const { client_id, line_items, notes, days_until_due, auto_finalize } = body;

    if (!client_id) throw new Error("client_id is required");
    if (!Array.isArray(line_items) || line_items.length === 0) {
      throw new Error("At least one line item is required");
    }
    const cleaned = line_items
      .map((l) => ({
        description: (l.description ?? "").trim() || "Services",
        amount: Number(l.amount),
      }))
      .filter((l) => Number.isFinite(l.amount) && l.amount > 0);
    if (!cleaned.length) throw new Error("Each line item needs a positive amount");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: client, error: clientErr } = await admin
      .from("clients")
      .select("id, name, email, stripe_customer_id, billing_paused_until")
      .eq("id", client_id).single();
    if (clientErr || !client) throw new Error("Client not found");
    if (!client.email) throw new Error("Client has no email — add one before invoicing");
    if (client.billing_paused_until && new Date(client.billing_paused_until) > new Date()) {
      throw new Error("Billing is paused for this client");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" as any });

    // Ensure Stripe customer
    let customerId = client.stripe_customer_id;
    if (!customerId) {
      const existing = await stripe.customers.list({ email: client.email, limit: 1 });
      customerId = existing.data[0]?.id ?? (await stripe.customers.create({
        email: client.email, name: client.name, metadata: { client_id: client.id },
      })).id;
      await admin.from("clients").update({ stripe_customer_id: customerId }).eq("id", client.id);
    }

    const amountDue = Number(cleaned.reduce((s, l) => s + l.amount, 0).toFixed(2));

    // Header row first so we have an id for metadata
    const { data: header, error: headerErr } = await admin
      .from("hourly_invoices")
      .insert({
        client_id: client.id,
        stripe_customer_id: customerId,
        status: "draft",
        invoice_type: "flat",
        hourly_rate: 0,
        total_hours: 0,
        amount_due: amountDue,
        currency: "usd",
        notes: notes ?? null,
        created_by: userId,
      })
      .select().single();
    if (headerErr) throw headerErr;

    const invoice = await stripe.invoices.create({
      customer: customerId!,
      collection_method: "send_invoice",
      days_until_due: days_until_due ?? 14,
      auto_advance: false,
      description: notes ?? "Services",
      metadata: {
        hourly_invoice_id: header.id,
        client_id: client.id,
        invoice_type: "flat",
      },
    });

    for (const li of cleaned) {
      await stripe.invoiceItems.create({
        customer: customerId!,
        invoice: invoice.id,
        currency: "usd",
        amount: Math.round(li.amount * 100),
        description: li.description,
      });
    }

    let finalInvoice: any = invoice;
    if (auto_finalize) {
      finalInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
      try { await stripe.invoices.sendInvoice(invoice.id); } catch (e) { console.warn("sendInvoice:", e); }
    } else {
      finalInvoice = await stripe.invoices.retrieve(invoice.id);
    }

    await admin.from("hourly_invoices").update({
      stripe_invoice_id: finalInvoice.id,
      invoice_number: finalInvoice.number ?? null,
      hosted_invoice_url: finalInvoice.hosted_invoice_url ?? null,
      invoice_pdf: finalInvoice.invoice_pdf ?? null,
      status: finalInvoice.status ?? "draft",
      amount_due: (finalInvoice.amount_due ?? Math.round(amountDue * 100)) / 100,
    }).eq("id", header.id);

    return new Response(JSON.stringify({
      hourly_invoice_id: header.id,
      stripe_invoice_id: finalInvoice.id,
      hosted_invoice_url: finalInvoice.hosted_invoice_url,
      status: finalInvoice.status,
      amount_due: amountDue,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (err: any) {
    console.error("create-flat-invoice error:", err);
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
    });
  }
});