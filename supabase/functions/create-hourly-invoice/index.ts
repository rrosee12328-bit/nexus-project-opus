import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  client_id: string;
  timesheet_ids: string[];
  hourly_rate: number;
  notes?: string;
  days_until_due?: number;
  auto_finalize?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    // Auth: must be admin
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

    const body: Body = await req.json();
    const { client_id, timesheet_ids, hourly_rate, notes, days_until_due, auto_finalize } = body;

    if (!client_id || !timesheet_ids?.length || !hourly_rate || hourly_rate <= 0) {
      throw new Error("client_id, timesheet_ids and hourly_rate are required");
    }

    // Service-role client for DB writes
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load client
    const { data: client, error: clientErr } = await admin
      .from("clients")
      .select("id, name, email, stripe_customer_id")
      .eq("id", client_id)
      .single();
    if (clientErr || !client) throw new Error("Client not found");
    if (!client.email) throw new Error("Client has no email — add one before invoicing");

    // Load entries — must be unbilled and belong to this client (via project)
    const { data: entries, error: entriesErr } = await admin
      .from("timesheets")
      .select(
        `id, hours, date, description, billable, invoiced_at,
         projects!inner ( client_id, name, project_number ),
         time_tracking_codes ( code, label )`
      )
      .in("id", timesheet_ids);
    if (entriesErr) throw entriesErr;
    if (!entries?.length) throw new Error("No matching timesheet entries");

    const invalid = entries.find((e: any) => e.projects?.client_id !== client_id);
    if (invalid) throw new Error("All entries must belong to the selected client");
    const alreadyBilled = entries.find((e: any) => e.invoiced_at);
    if (alreadyBilled) throw new Error("One or more entries are already invoiced");

    const totalHours = entries.reduce((s: number, e: any) => s + Number(e.hours || 0), 0);
    const amountDue = Number((totalHours * hourly_rate).toFixed(2));

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" as any });

    // Ensure Stripe customer
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

    // Date range
    const dates = entries.map((e: any) => e.date).sort();
    const periodStart = dates[0];
    const periodEnd = dates[dates.length - 1];

    // Create header row first so we have an ID to attach via metadata
    const { data: header, error: headerErr } = await admin
      .from("hourly_invoices")
      .insert({
        client_id: client.id,
        stripe_customer_id: customerId,
        status: "draft",
        hourly_rate,
        total_hours: totalHours,
        amount_due: amountDue,
        currency: "usd",
        period_start: periodStart,
        period_end: periodEnd,
        notes: notes ?? null,
        created_by: userId,
      })
      .select()
      .single();
    if (headerErr) throw headerErr;

    // Create draft invoice
    const invoice = await stripe.invoices.create({
      customer: customerId!,
      collection_method: "send_invoice",
      days_until_due: days_until_due ?? 14,
      auto_advance: false,
      description: notes ?? `Hourly work — ${periodStart} to ${periodEnd}`,
      metadata: {
        hourly_invoice_id: header.id,
        client_id: client.id,
      },
    });

    // Add one line item per timesheet entry
    for (const e of entries as any[]) {
      const code = e.time_tracking_codes?.code ? `[${e.time_tracking_codes.code}] ` : "";
      const desc = `${e.date} · ${code}${(e.description ?? "Work").slice(0, 200)} (${Number(e.hours).toFixed(2)}h)`;
      await stripe.invoiceItems.create({
        customer: customerId!,
        invoice: invoice.id,
        currency: "usd",
        unit_amount: Math.round(hourly_rate * 100),
        quantity: Math.round(Number(e.hours) * 100) / 100 as any,
        description: desc,
      } as any).catch(async () => {
        // Stripe requires integer quantities — fall back to amount-based item
        await stripe.invoiceItems.create({
          customer: customerId!,
          invoice: invoice.id,
          currency: "usd",
          amount: Math.round(Number(e.hours) * hourly_rate * 100),
          description: desc,
        });
      });
    }

    // Optionally finalize immediately
    let finalInvoice: any = invoice;
    if (auto_finalize) {
      finalInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
      try {
        await stripe.invoices.sendInvoice(invoice.id);
      } catch (e) {
        console.warn("sendInvoice failed (likely already sent):", e);
      }
    } else {
      // Refresh to get hosted url
      finalInvoice = await stripe.invoices.retrieve(invoice.id);
    }

    // Update header with stripe info
    await admin
      .from("hourly_invoices")
      .update({
        stripe_invoice_id: finalInvoice.id,
        invoice_number: finalInvoice.number ?? null,
        hosted_invoice_url: finalInvoice.hosted_invoice_url ?? null,
        invoice_pdf: finalInvoice.invoice_pdf ?? null,
        status: finalInvoice.status ?? "draft",
        amount_due: (finalInvoice.amount_due ?? Math.round(amountDue * 100)) / 100,
      })
      .eq("id", header.id);

    // Mark timesheet rows as invoiced
    await admin
      .from("timesheets")
      .update({
        invoiced_at: new Date().toISOString(),
        stripe_invoice_id: finalInvoice.id,
        hourly_rate,
        hourly_invoice_id: header.id,
      })
      .in("id", timesheet_ids);

    return new Response(
      JSON.stringify({
        hourly_invoice_id: header.id,
        stripe_invoice_id: finalInvoice.id,
        hosted_invoice_url: finalInvoice.hosted_invoice_url,
        status: finalInvoice.status,
        amount_due: amountDue,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    console.error("create-hourly-invoice error:", err);
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});