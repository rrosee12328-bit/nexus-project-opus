import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface LineEdit {
  invoice_item_id?: string | null; // existing stripe invoice item id
  description: string;
  amount: number; // dollars
  delete?: boolean;
}

interface Body {
  hourly_invoice_id: string;
  hourly_rate?: number;
  notes?: string | null;
  line_items?: LineEdit[];
}

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

    const body: Body = await req.json();
    const { hourly_invoice_id, hourly_rate, notes, line_items } = body;
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
    if (header.status !== "draft") {
      throw new Error("Only draft invoices can be edited. Use Duplicate to make changes to a finalized invoice.");
    }
    if (!header.stripe_invoice_id) throw new Error("Invoice has no Stripe ID");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" as any });

    // Update notes/description on Stripe invoice
    const invoiceUpdate: any = {};
    if (notes !== undefined) invoiceUpdate.description = notes ?? "";
    if (Object.keys(invoiceUpdate).length) {
      await stripe.invoices.update(header.stripe_invoice_id, invoiceUpdate);
    }

    // Apply line item edits
    if (Array.isArray(line_items)) {
      for (const li of line_items) {
        const amountCents = Math.round(Number(li.amount) * 100);
        if (li.invoice_item_id) {
          if (li.delete) {
            await stripe.invoiceItems.del(li.invoice_item_id);
          } else {
            await stripe.invoiceItems.update(li.invoice_item_id, {
              description: li.description,
              amount: amountCents,
              currency: "usd",
            });
          }
        } else if (!li.delete) {
          await stripe.invoiceItems.create({
            customer: header.stripe_customer_id!,
            invoice: header.stripe_invoice_id,
            currency: "usd",
            amount: amountCents,
            description: li.description,
          });
        }
      }
    }

    // Refresh totals from Stripe
    const refreshed = await stripe.invoices.retrieve(header.stripe_invoice_id);

    const dbUpdate: any = {
      amount_due: (refreshed.amount_due ?? 0) / 100,
      updated_at: new Date().toISOString(),
    };
    if (notes !== undefined) dbUpdate.notes = notes;
    if (hourly_rate !== undefined && hourly_rate > 0) dbUpdate.hourly_rate = hourly_rate;

    await admin.from("hourly_invoices").update(dbUpdate).eq("id", header.id);

    return new Response(
      JSON.stringify({ ok: true, amount_due: dbUpdate.amount_due }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    console.error("update-hourly-invoice error:", err);
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});