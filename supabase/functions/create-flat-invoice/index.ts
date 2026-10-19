import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { ensureStripeCustomer } from "../_shared/stripe-customer.ts";

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
  client_id?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  line_items: LineItem[];
  notes?: string;
  days_until_due?: number;
  auto_finalize?: boolean;
  force?: boolean;
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
    const {
      client_id,
      customer_name,
      customer_email,
      customer_phone,
      line_items,
      notes,
      days_until_due,
      auto_finalize,
      force,
    } = body;

    const normalizedEmail = (customer_email ?? "").trim().toLowerCase();
    const normalizedName = (customer_name ?? "").trim();
    if (!client_id && (!normalizedName || !normalizedEmail)) {
      throw new Error("Choose an existing client or enter the customer's name and email");
    }
    if (!client_id && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error("Enter a valid customer email address");
    }
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

    let client: {
      id: string;
      name: string;
      email: string | null;
      stripe_customer_id: string | null;
      billing_paused_until: string | null;
      billing_contact_only: boolean;
    } | null = null;
    let customerCreated = false;
    let customerReused = false;

    if (client_id) {
      const { data, error } = await admin
        .from("clients")
        .select("id, name, email, stripe_customer_id, billing_paused_until, billing_contact_only")
        .eq("id", client_id)
        .single();
      if (error || !data) throw new Error("Client not found");
      client = data;
    } else {
      const { data: existing, error: lookupError } = await admin
        .from("clients")
        .select("id, name, email, stripe_customer_id, billing_paused_until, billing_contact_only")
        .ilike("email", normalizedEmail)
        .order("billing_contact_only", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (lookupError) throw lookupError;

      if (existing) {
        client = existing;
        customerReused = true;
      } else {
        const { data: created, error: createError } = await admin
          .from("clients")
          .insert({
            name: normalizedName,
            email: normalizedEmail,
            phone: (customer_phone ?? "").trim() || null,
            status: "closed",
            type: "Billing contact",
            lead_source: "one_time_invoice",
            billing_contact_only: true,
            notes: "Created automatically from a one-time invoice.",
          })
          .select("id, name, email, stripe_customer_id, billing_paused_until, billing_contact_only")
          .single();
        if (createError || !created) throw createError ?? new Error("Could not create billing contact");
        client = created;
        customerCreated = true;
      }
    }

    if (!client) throw new Error("Customer could not be resolved");
    if (!client.email) throw new Error("Customer has no email — add one before invoicing");
    if (!client.billing_contact_only && !force && client.billing_paused_until && new Date(client.billing_paused_until) > new Date()) {
      throw new Error("Billing is paused for this client");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" as any });

    const customerId = await ensureStripeCustomer(stripe, admin, {
      ...client,
      email: client.email,
    });

    const amountDue = Number(cleaned.reduce((s, l) => s + l.amount, 0).toFixed(2));

    // Create Stripe invoice + items FIRST so a failure here doesn't leave an orphan DB row
    const invoice = await stripe.invoices.create({
      customer: customerId!,
      collection_method: "send_invoice",
      days_until_due: days_until_due ?? 14,
      auto_advance: false,
      description: notes ?? "Services",
      metadata: { client_id: client.id, invoice_type: "flat" },
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

    const { data: header, error: headerErr } = await admin
      .from("hourly_invoices")
      .insert({
        client_id: client.id,
        stripe_customer_id: customerId,
        invoice_type: "flat",
        hourly_rate: 0,
        total_hours: 0,
        currency: "usd",
        notes: notes ?? null,
        created_by: userId,
      stripe_invoice_id: finalInvoice.id,
      invoice_number: finalInvoice.number ?? null,
      hosted_invoice_url: finalInvoice.hosted_invoice_url ?? null,
      invoice_pdf: finalInvoice.invoice_pdf ?? null,
      status: finalInvoice.status ?? "draft",
      amount_due: (finalInvoice.amount_due ?? Math.round(amountDue * 100)) / 100,
      })
      .select().single();
    if (headerErr) throw headerErr;

    // Attach the new DB id back to the Stripe invoice metadata so webhooks can link them
    try {
      await stripe.invoices.update(finalInvoice.id, {
        metadata: { client_id: client.id, invoice_type: "flat", hourly_invoice_id: header.id },
      });
    } catch (e) { console.warn("stripe metadata update failed:", e); }

    return new Response(JSON.stringify({
      hourly_invoice_id: header.id,
      stripe_invoice_id: finalInvoice.id,
      hosted_invoice_url: finalInvoice.hosted_invoice_url,
      status: finalInvoice.status,
      amount_due: amountDue,
      client_id: client.id,
      customer_created: customerCreated,
      customer_reused: customerReused,
      customer_name: client.name,
      customer_email: client.email,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (err: any) {
    console.error("create-flat-invoice error:", err);
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
    });
  }
});
