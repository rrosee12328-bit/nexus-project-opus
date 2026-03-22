import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token, signed_name, client_name, company_name, client_address, client_email } =
      await req.json();

    if (!token || !signed_name?.trim()) {
      return new Response(
        JSON.stringify({ error: "Token and signed name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch proposal
    const { data: proposal, error: fetchError } = await supabaseAdmin
      .from("proposals")
      .select("*")
      .eq("token", token)
      .single();

    if (fetchError || !proposal) {
      return new Response(
        JSON.stringify({ error: "Proposal not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (proposal.signed_at) {
      return new Response(
        JSON.stringify({ error: "This contract has already been signed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Update proposal with signature and client details
    const { error: updateError } = await supabaseAdmin
      .from("proposals")
      .update({
        signed_name: signed_name.trim(),
        signed_at: new Date().toISOString(),
        client_name: client_name?.trim() || proposal.client_name,
        company_name: company_name?.trim() || proposal.company_name,
        client_address: client_address?.trim() || proposal.client_address,
        client_email: client_email?.trim() || proposal.client_email,
        status: "signed",
      })
      .eq("id", proposal.id);

    if (updateError) throw updateError;

    // Also update the client record with the filled-in email if missing
    if (proposal.client_id && client_email?.trim()) {
      await supabaseAdmin
        .from("clients")
        .update({
          email: client_email.trim(),
          name: client_name?.trim() || undefined,
        })
        .eq("id", proposal.client_id)
        .is("email", null);
    }

    // Trigger contract PDF generation asynchronously
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    try {
      await fetch(`${supabaseUrl}/functions/v1/generate-contract-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ proposal_id: proposal.id }),
      });
    } catch (pdfErr) {
      // Log but don't fail the signing — PDF can be regenerated
      console.error("PDF generation call failed (non-blocking):", pdfErr);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("sign-proposal error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
