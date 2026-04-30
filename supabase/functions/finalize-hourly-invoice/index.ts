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

    const { hourly_invoice_id, send } = await req.json();
    if (!hourly_invoice_id) throw new Error("hourly_invoice_id required");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: header, error: hErr } = await admin
      .from("hourly_invoices")
      .select("*")
      .eq("id", hourly_invoice_id)
      .single();
    if (hErr || !header) throw new Error("Invoice not found");
    if (!header.stripe_invoice_id) throw new Error("No Stripe invoice attached");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" as any });

    let inv = await stripe.invoices.retrieve(header.stripe_invoice_id);
    if (inv.status === "draft") {
      inv = await stripe.invoices.finalizeInvoice(header.stripe_invoice_id);
    }
    if (send) {
      try {
        await stripe.invoices.sendInvoice(header.stripe_invoice_id);
      } catch (e) {
        console.warn("sendInvoice failed:", e);
      }
      inv = await stripe.invoices.retrieve(header.stripe_invoice_id);
    }

    await admin
      .from("hourly_invoices")
      .update({
        status: inv.status ?? header.status,
        invoice_number: inv.number ?? header.invoice_number,
        hosted_invoice_url: inv.hosted_invoice_url ?? header.hosted_invoice_url,
        invoice_pdf: inv.invoice_pdf ?? header.invoice_pdf,
        finalized_at: header.finalized_at ?? new Date().toISOString(),
      })
      .eq("id", header.id);

    return new Response(
      JSON.stringify({
        status: inv.status,
        hosted_invoice_url: inv.hosted_invoice_url,
        invoice_pdf: inv.invoice_pdf,
        number: inv.number,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    console.error("finalize-hourly-invoice error:", err);
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});