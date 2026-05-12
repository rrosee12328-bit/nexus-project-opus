import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
    const SRC = 'in_1TS234RwKYaOJUtPXhCTjx1O';   // EISGMVOT-0002 (correct $1,906.25)
    const DST = 'in_1TWLN7RwKYaOJUtPnLFDHv3b';   // current draft
    const dst = await stripe.invoices.retrieve(DST);
    if (dst.status !== 'draft') {
      return new Response(JSON.stringify({ error: 'Draft invoice no longer editable', status: dst.status }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 1. Pull lines from the source invoice (truth)
    const srcLines: Stripe.InvoiceLineItem[] = [];
    let after: string | undefined;
    do {
      const page = await stripe.invoices.listLineItems(SRC, { limit: 100, starting_after: after });
      srcLines.push(...page.data);
      after = page.has_more ? page.data[page.data.length - 1].id : undefined;
    } while (after);

    // 2. Wipe all invoice items currently attached to the draft
    const dstLines: Stripe.InvoiceLineItem[] = [];
    after = undefined;
    do {
      const page = await stripe.invoices.listLineItems(DST, { limit: 100, starting_after: after });
      dstLines.push(...page.data);
      after = page.has_more ? page.data[page.data.length - 1].id : undefined;
    } while (after);

    const deleted: string[] = [];
    for (const l of dstLines) {
      // @ts-ignore parent shape
      const iid = (l as any).invoice_item || (l as any).parent?.invoice_item_details?.invoice_item;
      if (typeof iid === 'string') {
        try { await stripe.invoiceItems.del(iid); deleted.push(iid); } catch (e) { console.warn('del fail', iid, e); }
      }
    }

    // 3. Recreate source lines onto the draft
    const created: string[] = [];
    for (const l of srcLines) {
      const item = await stripe.invoiceItems.create({
        customer: dst.customer as string,
        invoice: DST,
        currency: l.currency,
        amount: l.amount, // cents, signed
        description: l.description ?? undefined,
      });
      created.push(item.id);
    }

    // 4. Add the -$445.20 credit line
    const credit = await stripe.invoiceItems.create({
      customer: dst.customer as string,
      invoice: DST,
      currency: 'usd',
      amount: -44520,
      description: 'Credit',
    });

    const refreshed = await stripe.invoices.retrieve(DST);
    return new Response(JSON.stringify({
      ok: true,
      deleted_count: deleted.length,
      recreated_count: created.length,
      credit_id: credit.id,
      new_total: refreshed.total,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});