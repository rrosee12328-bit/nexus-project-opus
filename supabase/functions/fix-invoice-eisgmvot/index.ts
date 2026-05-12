import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const INVOICE_ID = "in_1TWLN7RwKYaOJUtPnLFDHv3b";
const CUSTOMER_ID = "cus_UJ4CtAfgC489gi";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // List items on draft invoice
    const items = await stripe.invoiceItems.list({ customer: CUSTOMER_ID, limit: 100, pending: true });
    const onInvoice = items.data.filter((i: any) => i.invoice === INVOICE_ID);
    const negatives = onInvoice.filter((i: any) => i.amount < 0);
    // Delete existing negative credit lines
    for (const it of negatives) {
      await stripe.invoiceItems.del(it.id);
    }
    // Recreate credit with description
    const created = await stripe.invoiceItems.create({
      customer: CUSTOMER_ID,
      invoice: INVOICE_ID,
      currency: "usd",
      amount: -44425,
      description: "Credit for May 8th payment for Vektiss Studio Equipment",
    });
    const inv = await stripe.invoices.retrieve(INVOICE_ID);
    return new Response(JSON.stringify({ ok: true, deleted: negatives.length, created: created.id, total: inv.total }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
