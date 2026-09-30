import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth header");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) throw new Error("Unauthorized");

    const { data: role } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("Admin role required");

    const { hourly_invoice_id } = await req.json();
    if (!hourly_invoice_id) throw new Error("hourly_invoice_id required");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: header, error: invoiceError } = await admin
      .from("hourly_invoices")
      .select("id, invoice_number, stripe_invoice_id, status")
      .eq("id", hourly_invoice_id)
      .single();
    if (invoiceError || !header) throw new Error("Invoice not found");
    if (!header.stripe_invoice_id) throw new Error("This invoice is not connected to Stripe");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" as any });
    const invoice = await stripe.invoices.retrieve(header.stripe_invoice_id);

    if (invoice.status !== "open") {
      throw new Error(`Only an open invoice can be resent. This invoice is ${invoice.status ?? header.status}.`);
    }
    if (invoice.collection_method !== "send_invoice") {
      throw new Error("This invoice is charged automatically and does not use an emailed payment request");
    }

    const sent = await stripe.invoices.sendInvoice(invoice.id);

    return new Response(JSON.stringify({
      success: true,
      invoice_number: sent.number ?? header.invoice_number,
      sent_to: sent.customer_email ?? null,
      hosted_invoice_url: sent.hosted_invoice_url ?? null,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("resend-hourly-invoice error:", error);
    return new Response(JSON.stringify({ error: error.message ?? String(error) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
