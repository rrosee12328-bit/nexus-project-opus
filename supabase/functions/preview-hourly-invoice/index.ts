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

    const { hourly_invoice_id } = await req.json();
    if (!hourly_invoice_id) throw new Error("hourly_invoice_id required");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: header, error: hErr } = await admin
      .from("hourly_invoices")
      .select("*, clients(name, email, client_number)")
      .eq("id", hourly_invoice_id)
      .single();
    if (hErr || !header) throw new Error("Invoice not found");

    let stripeInvoice: any = null;
    let lineItems: any[] = [];

    if (header.stripe_invoice_id) {
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" as any });
      stripeInvoice = await stripe.invoices.retrieve(header.stripe_invoice_id, {
        expand: ["lines.data"],
      });
      lineItems = (stripeInvoice.lines?.data ?? []).map((l: any) => ({
        description: l.description,
        amount: (l.amount ?? 0) / 100,
        quantity: l.quantity,
      }));

      // Sync hosted URL/PDF if Stripe now has them but DB doesn't
      if (
        (stripeInvoice.hosted_invoice_url && !header.hosted_invoice_url) ||
        (stripeInvoice.invoice_pdf && !header.invoice_pdf) ||
        stripeInvoice.status !== header.status
      ) {
        await admin
          .from("hourly_invoices")
          .update({
            hosted_invoice_url: stripeInvoice.hosted_invoice_url ?? header.hosted_invoice_url,
            invoice_pdf: stripeInvoice.invoice_pdf ?? header.invoice_pdf,
            status: stripeInvoice.status ?? header.status,
            invoice_number: stripeInvoice.number ?? header.invoice_number,
          })
          .eq("id", header.id);
      }
    }

    return new Response(
      JSON.stringify({
        invoice: header,
        stripe: stripeInvoice
          ? {
              id: stripeInvoice.id,
              status: stripeInvoice.status,
              number: stripeInvoice.number,
              hosted_invoice_url: stripeInvoice.hosted_invoice_url,
              invoice_pdf: stripeInvoice.invoice_pdf,
              amount_due: (stripeInvoice.amount_due ?? 0) / 100,
              amount_paid: (stripeInvoice.amount_paid ?? 0) / 100,
              total: (stripeInvoice.total ?? 0) / 100,
              currency: stripeInvoice.currency,
              due_date: stripeInvoice.due_date,
              customer_email: stripeInvoice.customer_email,
              customer_name: stripeInvoice.customer_name,
              description: stripeInvoice.description,
            }
          : null,
        line_items: lineItems,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    console.error("preview-hourly-invoice error:", err);
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});