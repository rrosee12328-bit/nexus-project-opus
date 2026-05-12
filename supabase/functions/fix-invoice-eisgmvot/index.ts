import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const INVOICE_ID = "in_1TWLN7RwKYaOJUtPnLFDHv3b";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const inv: any = await stripe.invoices.retrieve(INVOICE_ID, { expand: ["lines.data"] });
    const negLines = inv.lines.data.filter((l: any) => l.amount < 0);
    let deleted = 0;
    for (const line of negLines) {
      const iiId = line.invoice_item || (line.parent?.invoice_item_details?.invoice_item);
      if (iiId) {
        try { await stripe.invoiceItems.del(iiId); deleted++; } catch (e) { console.log("del fail", iiId, e); }
      }
    }
    const final = await stripe.invoices.retrieve(INVOICE_ID);
    return new Response(JSON.stringify({ ok: true, deleted, total: final.total, negCount: negLines.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
