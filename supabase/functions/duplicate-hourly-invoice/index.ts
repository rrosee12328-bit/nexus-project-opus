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
    const userId = userData.user.id;

    const { data: roleRow } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Admin role required");

    const { hourly_invoice_id, target_client_id, transfer_entries = false } = await req.json();
    if (!hourly_invoice_id) throw new Error("hourly_invoice_id required");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: original, error: oErr } = await admin
      .from("hourly_invoices")
      .select("*")
      .eq("id", hourly_invoice_id)
      .single();
    if (oErr || !original) throw new Error("Original invoice not found");

    const clientId = target_client_id || original.client_id;

    const { data: client, error: cErr } = await admin
      .from("clients")
      .select("id, name, email, stripe_customer_id")
      .eq("id", clientId)
      .single();
    if (cErr || !client) throw new Error("Client not found");
    if (!client.email) throw new Error("Client has no email — add one before invoicing");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" as any });

    // Fetch original Stripe lines (if any)
    let originalLines: any[] = [];
    if (original.stripe_invoice_id) {
      const orig = await stripe.invoices.retrieve(original.stripe_invoice_id, {
        expand: ["lines.data"],
      });
      originalLines = orig.lines?.data ?? [];
    }

    // Ensure stripe customer for target
    let customerId = client.stripe_customer_id;
    if (!customerId) {
      const existing = await stripe.customers.list({ email: client.email, limit: 1 });
      if (existing.data.length) {
        customerId = existing.data[0].id;
      } else {
        const created = await stripe.customers.create({
          email: client.email,
          name: client.name,
          metadata: { client_id: client.id },
        });
        customerId = created.id;
      }
      await admin.from("clients").update({ stripe_customer_id: customerId }).eq("id", client.id);
    }

    // Create new draft DB row (no timesheet/calendar links — credit/adjustment-style copy)
    const { data: header, error: hErr } = await admin
      .from("hourly_invoices")
      .insert({
        client_id: clientId,
        stripe_customer_id: customerId,
        status: "draft",
        hourly_rate: original.hourly_rate,
        total_hours: original.total_hours,
        amount_due: original.amount_due,
        currency: original.currency ?? "usd",
        period_start: original.period_start,
        period_end: original.period_end,
        notes: original.notes ? `Copy of ${original.invoice_number ?? "previous invoice"}: ${original.notes}` : `Copy of ${original.invoice_number ?? "previous invoice"}`,
        created_by: userId,
      })
      .select()
      .single();
    if (hErr) throw hErr;

    // Create new Stripe draft
    const newInvoice = await stripe.invoices.create({
      customer: customerId!,
      collection_method: "send_invoice",
      days_until_due: 14,
      auto_advance: false,
      description: header.notes ?? undefined,
      metadata: {
        hourly_invoice_id: header.id,
        client_id: clientId,
        duplicated_from: original.id,
      },
    });

    // Copy line items
    for (const l of originalLines) {
      await stripe.invoiceItems.create({
        customer: customerId!,
        invoice: newInvoice.id,
        currency: "usd",
        amount: l.amount ?? 0,
        description: l.description ?? "Line item",
      });
    }

    const refreshed = await stripe.invoices.retrieve(newInvoice.id);

    await admin
      .from("hourly_invoices")
      .update({
        stripe_invoice_id: refreshed.id,
        invoice_number: refreshed.number ?? null,
        hosted_invoice_url: refreshed.hosted_invoice_url ?? null,
        invoice_pdf: refreshed.invoice_pdf ?? null,
        status: refreshed.status ?? "draft",
        amount_due: (refreshed.amount_due ?? 0) / 100,
      })
      .eq("id", header.id);

    // Optionally transfer linked timesheet/calendar entries from the original
    // to the new draft so the work isn't double-billed and isn't lost.
    if (transfer_entries) {
      await admin
        .from("timesheets")
        .update({ hourly_invoice_id: header.id, stripe_invoice_id: refreshed.id })
        .eq("hourly_invoice_id", original.id);
      await admin
        .from("calendar_events")
        .update({ hourly_invoice_id: header.id, stripe_invoice_id: refreshed.id })
        .eq("hourly_invoice_id", original.id);
    }

    return new Response(
      JSON.stringify({ hourly_invoice_id: header.id, stripe_invoice_id: refreshed.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    console.error("duplicate-hourly-invoice error:", err);
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});