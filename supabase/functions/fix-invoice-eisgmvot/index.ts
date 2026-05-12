import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const INVOICE_ID = "in_1TWLN7RwKYaOJUtPnLFDHv3b";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const today = Math.floor(Date.now() / 1000);
    const updated = await stripe.invoices.update(INVOICE_ID, { due_date: today, collection_method: "send_invoice" } as any);
    return new Response(JSON.stringify({ ok: true, due_date: updated.due_date, collection_method: updated.collection_method }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
