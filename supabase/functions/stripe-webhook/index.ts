import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Stripe webhook signature verification using Web Crypto API
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  const parts = sigHeader.split(",").reduce(
    (acc, part) => {
      const [key, val] = part.split("=");
      if (key === "t") acc.timestamp = val;
      if (key === "v1") acc.signatures.push(val);
      return acc;
    },
    { timestamp: "", signatures: [] as string[] }
  );

  if (!parts.timestamp || parts.signatures.length === 0) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(parts.timestamp)) > 300) return false;

  const signedPayload = `${parts.timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload)
  );
  const expectedSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return parts.signatures.some((s) => s === expectedSig);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeWebhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response(JSON.stringify({ error: "No signature" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.text();

  const valid = await verifyStripeSignature(body, signature, stripeWebhookSecret);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const event = JSON.parse(body);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    switch (event.type) {
      case "invoice.created":
      case "invoice.updated":
      case "invoice.finalized":
      case "invoice.paid":
      case "invoice.payment_succeeded":
      case "invoice.payment_failed":
      case "invoice.sent":
      case "invoice.voided": {
        const invoice = event.data.object;
        await handleInvoice(supabase, invoice);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        await handleSubscription(supabase, subscription);
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object;
        // Link stripe customer to client if metadata includes client_id
        if (session.customer && session.metadata?.client_id) {
          await supabase
            .from("clients")
            .update({ stripe_customer_id: session.customer })
            .eq("id", session.metadata.client_id);
        }

        // Handle bi-monthly checkout: checkout created the 15th sub, now create the 30th sub
        if (session.metadata?.billing_schedule === "bimonthly") {
          await handleBimonthlySetup(supabase, session);
        }
        // Handle proposal-based payment checkout completion
        else if (session.metadata?.proposal_id) {
          await handleProposalPayment(supabase, session);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleBimonthlySetup(supabase: any, session: any) {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    console.error("STRIPE_SECRET_KEY not configured for bimonthly setup");
    return;
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
  const customerId = session.customer;
  const proposalId = session.metadata?.proposal_id;
  const clientId = session.metadata?.client_id;
  const monthlyFee = parseFloat(session.metadata?.monthly_fee || "0");

  if (!customerId || !proposalId || monthlyFee <= 0) {
    console.error("Missing data for bimonthly setup", { customerId, proposalId, monthlyFee });
    return;
  }

  const halfAmount = Math.round((monthlyFee / 2) * 100);

  // Get proposal client name
  const { data: proposal } = await supabase
    .from("proposals")
    .select("client_name, setup_fee, monthly_fee, client_email")
    .eq("id", proposalId)
    .single();

  const clientLabel = proposal?.client_name || "Client";

  // The 15th subscription was already created by checkout — now create the 30th
  const now = new Date();
  let anchor30 = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 30));
  if (anchor30.getTime() / 1000 <= Math.floor(Date.now() / 1000)) {
    anchor30 = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 30));
  }

  const product30 = await stripe.products.create({
    name: `Vektiss AI & Automation — ${clientLabel} (30th)`,
    metadata: { client_id: clientId || "", proposal_id: proposalId },
  });
  const price30 = await stripe.prices.create({
    product: product30.id,
    unit_amount: halfAmount,
    currency: "usd",
    recurring: { interval: "month" },
  });

  const sub2 = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: price30.id }],
    billing_cycle_anchor: Math.floor(anchor30.getTime() / 1000),
    proration_behavior: "none",
    metadata: {
      client_id: clientId || "",
      proposal_id: proposalId,
      billing_half: "30th",
    },
  });

  // Get the subscription ID from checkout (the 15th sub)
  const sub1Id = session.subscription || "checkout-sub";

  console.log(`Bimonthly subscriptions: 15th=${sub1Id}, 30th=${sub2.id}`);

  // Mark proposal as paid
  await supabase
    .from("proposals")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_checkout_session_id: `bimonthly:${sub1Id},${sub2.id}`,
    })
    .eq("id", proposalId);

  // Record initial payment and update client
  if (clientId) {
    const paidNow = new Date();
    await supabase.from("client_payments").insert({
      client_id: clientId,
      amount: 0,
      payment_month: paidNow.getMonth() + 1,
      payment_year: paidNow.getFullYear(),
      notes: `Bi-monthly billing activated: $${(halfAmount / 100).toFixed(2)} on 15th & 30th`,
      stripe_invoice_id: session.id,
      payment_source: "stripe",
    });

    if (proposal) {
      await supabase
        .from("clients")
        .update({
          setup_fee: proposal.setup_fee,
          monthly_fee: proposal.monthly_fee,
          email: proposal.client_email,
          name: proposal.client_name,
        })
        .eq("id", clientId);
    }
  }
}

async function handleInvoice(supabase: any, invoice: any) {
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("stripe_customer_id", invoice.customer)
    .maybeSingle();

  if (!client) {
    console.warn(`No client found for Stripe customer ${invoice.customer}`);
    return;
  }

  const invoiceData = {
    client_id: client.id,
    stripe_invoice_id: invoice.id,
    stripe_invoice_number: invoice.number,
    amount_due: invoice.amount_due ?? 0,
    amount_paid: invoice.amount_paid ?? 0,
    currency: invoice.currency ?? "usd",
    status: invoice.status ?? "draft",
    due_date: invoice.due_date
      ? new Date(invoice.due_date * 1000).toISOString()
      : null,
    paid_at:
      invoice.status === "paid" && invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
        : null,
    hosted_invoice_url: invoice.hosted_invoice_url ?? null,
    invoice_pdf: invoice.invoice_pdf ?? null,
    description: invoice.description ?? null,
    period_start: invoice.period_start
      ? new Date(invoice.period_start * 1000).toISOString()
      : null,
    period_end: invoice.period_end
      ? new Date(invoice.period_end * 1000).toISOString()
      : null,
  };

  const { error } = await supabase
    .from("stripe_invoices")
    .upsert(invoiceData, { onConflict: "stripe_invoice_id" });

  if (error) {
    console.error("Failed to upsert invoice:", error);
    throw error;
  }

  // Sync hourly_invoices if this invoice was created from timesheet billing
  const hourlyInvoiceId = invoice.metadata?.hourly_invoice_id;
  if (hourlyInvoiceId) {
    const paidAtIso =
      invoice.status === "paid" && invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
        : null;
    const finalizedAtIso = invoice.status_transitions?.finalized_at
      ? new Date(invoice.status_transitions.finalized_at * 1000).toISOString()
      : null;

    await supabase
      .from("hourly_invoices")
      .update({
        stripe_invoice_id: invoice.id,
        stripe_customer_id: invoice.customer,
        invoice_number: invoice.number ?? null,
        hosted_invoice_url: invoice.hosted_invoice_url ?? null,
        invoice_pdf: invoice.invoice_pdf ?? null,
        status: invoice.status ?? "draft",
        amount_due: (invoice.amount_due ?? 0) / 100,
        amount_paid: (invoice.amount_paid ?? 0) / 100,
        finalized_at: finalizedAtIso,
        paid_at: paidAtIso,
      })
      .eq("id", hourlyInvoiceId);

    // Mark linked timesheet rows paid
    if (invoice.status === "paid") {
      await supabase
        .from("timesheets")
        .update({ paid_at: paidAtIso ?? new Date().toISOString() })
        .eq("hourly_invoice_id", hourlyInvoiceId);
    }
  }

  if (invoice.status === "paid" && invoice.amount_paid > 0) {
    const paidDate = invoice.status_transitions?.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000)
      : new Date();

    const { data: existing } = await supabase
      .from("client_payments")
      .select("id")
      .eq("stripe_invoice_id", invoice.id)
      .maybeSingle();

    if (!existing) {
      const { error: payErr } = await supabase.from("client_payments").insert({
        client_id: client.id,
        amount: invoice.amount_paid / 100,
        payment_month: paidDate.getMonth() + 1,
        payment_year: paidDate.getFullYear(),
        notes: invoice.number
          ? `Stripe invoice ${invoice.number}`
          : "Stripe payment",
        stripe_invoice_id: invoice.id,
        payment_source: "stripe",
      });
      if (payErr) console.error("Failed to insert client_payment:", payErr);
    }
  }
}

async function handleSubscription(supabase: any, subscription: any) {
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("stripe_customer_id", subscription.customer)
    .maybeSingle();

  if (!client) {
    console.warn(
      `No client found for Stripe customer ${subscription.customer}`
    );
    return;
  }

  const subData = {
    client_id: client.id,
    stripe_subscription_id: subscription.id,
    stripe_price_id: subscription.items?.data?.[0]?.price?.id ?? null,
    status: subscription.status,
    current_period_start: subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000).toISOString()
      : null,
    current_period_end: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
  };

  const { error } = await supabase
    .from("stripe_subscriptions")
    .upsert(subData, { onConflict: "stripe_subscription_id" });

  if (error) {
    console.error("Failed to upsert subscription:", error);
    throw error;
  }
}

async function handleProposalPayment(supabase: any, session: any) {
  const proposalId = session.metadata?.proposal_id;
  const clientId = session.metadata?.client_id;

  if (!proposalId) return;

  const { error: updateErr } = await supabase
    .from("proposals")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_checkout_session_id: session.id,
    })
    .eq("id", proposalId);

  if (updateErr) {
    console.error("Failed to update proposal paid status:", updateErr);
  }

  if (clientId && session.amount_total > 0) {
    const now = new Date();

    const { data: existing } = await supabase
      .from("client_payments")
      .select("id")
      .eq("stripe_invoice_id", session.id)
      .maybeSingle();

    if (!existing) {
      const { error: payErr } = await supabase.from("client_payments").insert({
        client_id: clientId,
        amount: session.amount_total / 100,
        payment_month: now.getMonth() + 1,
        payment_year: now.getFullYear(),
        notes: "Setup fee — proposal signed & paid",
        stripe_invoice_id: session.id,
        payment_source: "stripe",
      });

      if (payErr) {
        console.error("Failed to insert proposal payment:", payErr);
      } else {
        console.log(`Proposal payment recorded for client ${clientId}, triggering onboarding flow`);
      }
    }
  }

  if (clientId) {
    const { data: proposal } = await supabase
      .from("proposals")
      .select("setup_fee, monthly_fee, client_email, client_name")
      .eq("id", proposalId)
      .single();

    if (proposal) {
      await supabase
        .from("clients")
        .update({
          setup_fee: proposal.setup_fee,
          monthly_fee: proposal.monthly_fee,
          setup_paid: proposal.setup_fee,
          email: proposal.client_email,
          name: proposal.client_name,
        })
        .eq("id", clientId);
    }
  }
}
