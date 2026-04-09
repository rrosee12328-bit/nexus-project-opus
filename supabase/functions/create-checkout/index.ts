import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { proposal_token } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "Stripe not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // ── Proposal-based checkout (public, no auth required) ──
    if (proposal_token) {
      const { data: proposal, error: pErr } = await supabase
        .from("proposals")
        .select("*")
        .eq("token", proposal_token)
        .single();

      if (pErr || !proposal) {
        return new Response(
          JSON.stringify({ error: "Proposal not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!proposal.signed_at) {
        return new Response(
          JSON.stringify({ error: "Contract must be signed before payment" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Get or create Stripe customer for the client
      let customerId: string | undefined;
      if (proposal.client_id) {
        const { data: client } = await supabase
          .from("clients")
          .select("id, name, email, stripe_customer_id")
          .eq("id", proposal.client_id)
          .single();

        if (client) {
          customerId = client.stripe_customer_id ?? undefined;
          if (!customerId) {
            const customer = await stripe.customers.create({
              email: proposal.client_email || client.email || undefined,
              name: proposal.client_name || client.name,
              metadata: { vektiss_client_id: client.id },
            });
            customerId = customer.id;
            await supabase
              .from("clients")
              .update({ stripe_customer_id: customerId })
              .eq("id", client.id);
          }
        }
      }

      // If no client record, create customer from proposal data
      if (!customerId && proposal.client_email) {
        const customer = await stripe.customers.create({
          email: proposal.client_email,
          name: proposal.client_name || undefined,
        });
        customerId = customer.id;
      }

      const appUrl = "https://portal.vektiss.com";
      const logoUrl = `${appUrl}/vektiss-logo.png`;

      // Determine checkout mode based on fees
      const hasSetupFee = proposal.setup_fee > 0;
      const hasMonthlyFee = proposal.monthly_fee > 0;
      const billingSchedule = proposal.billing_schedule || "monthly";

      if (!hasSetupFee && !hasMonthlyFee) {
        return new Response(
          JSON.stringify({ error: "No amount to charge" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // ── Bi-monthly billing: subscription mode so Stripe shows two-panel checkout ──
      // Checkout creates the 15th subscription; webhook creates the 30th subscription
      if (!hasSetupFee && hasMonthlyFee && billingSchedule === "bimonthly") {
        const halfAmount = Math.round((proposal.monthly_fee / 2) * 100);
        const halfAmt = (proposal.monthly_fee / 2).toFixed(2);

        // Calculate next 15th for billing anchor
        const now = new Date();
        let anchor15 = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 15));
        if (anchor15.getTime() / 1000 <= Math.floor(Date.now() / 1000)) {
          anchor15 = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 15));
        }

        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          mode: "subscription",
          line_items: [{
            price_data: {
              currency: "usd",
              product_data: {
                name: `Vektiss AI & Automation — Bi-Monthly Service`,
                description: `$${halfAmt} charged on the 15th of each month\n$${halfAmt} charged on the 30th of each month\nTotal: $${proposal.monthly_fee.toFixed(2)}/mo`,
                images: [logoUrl],
              },
              unit_amount: halfAmount,
              recurring: { interval: "month" },
            },
            quantity: 1,
          }],
          subscription_data: {
            billing_cycle_anchor: Math.floor(anchor15.getTime() / 1000),
            proration_behavior: "none",
            metadata: {
              client_id: proposal.client_id || "",
              proposal_id: proposal.id,
              billing_half: "15th",
            },
          },
          custom_text: {
            submit: {
              message: `You are subscribing to Vektiss AI & Automation services.\n\n• Total: $${proposal.monthly_fee.toFixed(2)}/mo\n• Schedule: $${halfAmt} on the 15th + $${halfAmt} on the 30th\n• First charge: ${anchor15.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
            },
          },
          success_url: `${appUrl}/proposal/${proposal_token}?paid=true`,
          cancel_url: `${appUrl}/proposal/${proposal_token}?canceled=true`,
          metadata: {
            client_id: proposal.client_id || "",
            proposal_id: proposal.id,
            proposal_token: proposal_token,
            billing_schedule: "bimonthly",
            monthly_fee: String(proposal.monthly_fee),
          },
        });

        await supabase
          .from("proposals")
          .update({ stripe_checkout_session_id: session.id })
          .eq("id", proposal.id);

        return new Response(
          JSON.stringify({ url: session.url }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // If only monthly fee (no setup), create a subscription checkout
      if (!hasSetupFee && hasMonthlyFee) {
        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          mode: "subscription",
          line_items: [{
            price_data: {
              currency: "usd",
              product_data: {
                name: `Vektiss AI & Automation — Monthly Service`,
                description: `Monthly service for ${proposal.client_name || "Client"} — $${proposal.monthly_fee.toFixed(2)}/mo billed automatically`,
              },
              unit_amount: Math.round(proposal.monthly_fee * 100),
              recurring: { interval: "month" },
            },
            quantity: 1,
          }],
          custom_text: {
            submit: {
              message: `You are subscribing to Vektiss AI & Automation services at $${proposal.monthly_fee.toFixed(2)}/month. This will renew automatically each month until canceled.`,
            },
          },
          success_url: `${appUrl}/proposal/${proposal_token}?paid=true`,
          cancel_url: `${appUrl}/proposal/${proposal_token}?canceled=true`,
          metadata: {
            client_id: proposal.client_id || "",
            proposal_id: proposal.id,
            proposal_token: proposal_token,
          },
        });

        await supabase
          .from("proposals")
          .update({ stripe_checkout_session_id: session.id })
          .eq("id", proposal.id);

        return new Response(
          JSON.stringify({ url: session.url }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Setup fee as one-time payment
      const lineItems: any[] = [];
      if (hasSetupFee) {
        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: {
              name: `Vektiss AI & Automation — Setup Fee`,
              description: `One-time setup fee for ${proposal.client_name || "Client"}`,
            },
            unit_amount: Math.round(proposal.setup_fee * 100),
          },
          quantity: 1,
        });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "payment",
        line_items: lineItems,
        custom_text: {
          submit: {
            message: `One-time setup fee of $${proposal.setup_fee.toFixed(2)} for Vektiss AI & Automation services.${proposal.monthly_fee > 0 ? `\n\nAfter setup, monthly billing of $${proposal.monthly_fee.toFixed(2)}/mo begins automatically.` : ""}`,
          },
        },
        success_url: `${appUrl}/proposal/${proposal_token}?paid=true`,
        cancel_url: `${appUrl}/proposal/${proposal_token}?canceled=true`,
        metadata: {
          client_id: proposal.client_id || "",
          proposal_id: proposal.id,
          proposal_token: proposal_token,
        },
        invoice_creation: { enabled: true },
      });

      await supabase
        .from("proposals")
        .update({ stripe_checkout_session_id: session.id })
        .eq("id", proposal.id);

      return new Response(
        JSON.stringify({ url: session.url }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Standard authenticated checkout (existing flow) ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const { client_id, mode, price_id, amount, success_url, cancel_url } = body;

    if (!client_id) {
      return new Response(
        JSON.stringify({ error: "client_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: userRole } = await supabase.rpc("get_user_role", { _user_id: userId });
    const { data: clientRecord } = await supabase
      .from("clients")
      .select("id, name, email, stripe_customer_id")
      .eq("id", client_id)
      .single();

    if (!clientRecord) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (userRole !== "admin" && clientRecord.id !== (await supabase.rpc("get_client_id_for_user", { _user_id: userId }))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let customerId2 = clientRecord.stripe_customer_id;
    if (!customerId2) {
      const customer = await stripe.customers.create({
        email: clientRecord.email ?? undefined,
        name: clientRecord.name,
        metadata: { vektiss_client_id: client_id },
      });
      customerId2 = customer.id;
      await supabase
        .from("clients")
        .update({ stripe_customer_id: customerId2 })
        .eq("id", client_id);
    }

    const checkoutMode = mode === "subscription" ? "subscription" : "payment";
    const lineItems2: any[] = [];

    if (price_id) {
      lineItems2.push({ price: price_id, quantity: 1 });
    } else if (amount) {
      lineItems2.push({
        price_data: {
          currency: "usd",
          product_data: { name: `Payment for ${clientRecord.name}` },
          unit_amount: Math.round(amount * 100),
          ...(checkoutMode === "subscription" ? { recurring: { interval: "month" } } : {}),
        },
        quantity: 1,
      });
    } else {
      return new Response(
        JSON.stringify({ error: "price_id or amount required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId2,
      mode: checkoutMode,
      line_items: lineItems2,
      success_url: success_url || "https://portal.vektiss.com/portal/billing?success=true",
      cancel_url: cancel_url || "https://portal.vektiss.com/portal/billing?canceled=true",
      metadata: { client_id },
      invoice_creation: checkoutMode === "payment" ? { enabled: true } : undefined,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-checkout error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
