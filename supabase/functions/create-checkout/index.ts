import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
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
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } =
      await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub as string;

    const { client_id, mode, price_id, amount, success_url, cancel_url } =
      await req.json();

    if (!client_id) {
      return new Response(
        JSON.stringify({ error: "client_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller has access (admin or the client's own user)
    const { data: userRole } = await supabase.rpc("get_user_role", {
      _user_id: userId,
    });

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

    // Only admins or the client's own user can create checkout
    if (userRole !== "admin" && clientRecord.id !== (await supabase.rpc("get_client_id_for_user", { _user_id: userId }))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "Stripe not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Get or create Stripe customer
    let customerId = clientRecord.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: clientRecord.email ?? undefined,
        name: clientRecord.name,
        metadata: { vektiss_client_id: client_id },
      });
      customerId = customer.id;

      await supabase
        .from("clients")
        .update({ stripe_customer_id: customerId })
        .eq("id", client_id);
    }

    // Build checkout session params
    const checkoutMode = mode === "subscription" ? "subscription" : "payment";
    const lineItems: any[] = [];

    if (price_id) {
      lineItems.push({ price: price_id, quantity: 1 });
    } else if (amount) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: { name: `Payment for ${clientRecord.name}` },
          unit_amount: Math.round(amount * 100), // dollars → cents
          ...(checkoutMode === "subscription" ? { recurring: { interval: "month" } } : {}),
        },
        quantity: 1,
      });
    } else {
      return new Response(
        JSON.stringify({ error: "price_id or amount required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: checkoutMode,
      line_items: lineItems,
      success_url:
        success_url || "https://nexus-project-opus.lovable.app/portal/billing?success=true",
      cancel_url:
        cancel_url || "https://nexus-project-opus.lovable.app/portal/billing?canceled=true",
      metadata: { client_id },
      invoice_creation:
        checkoutMode === "payment" ? { enabled: true } : undefined,
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
