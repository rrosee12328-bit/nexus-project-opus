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
    const { token, signed_name, nda_signed_name, client_name, company_name, client_address, client_email, signature_data } =
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
    const signedAt = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("proposals")
      .update({
        signed_name: signed_name.trim(),
        signed_at: signedAt,
        nda_signed_name: nda_signed_name?.trim() || signed_name.trim(),
        nda_signed_at: signedAt,
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
      const pdfResponse = await fetch(`${supabaseUrl}/functions/v1/generate-contract-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ proposal_id: proposal.id }),
      });
      if (!pdfResponse.ok) {
        console.error("PDF generation returned an error:", await pdfResponse.text());
      }
    } catch (pdfErr) {
      console.error("PDF generation call failed (non-blocking):", pdfErr);
    }

    // Send email notification to client
    const finalClientEmail = client_email?.trim() || proposal.client_email;
    const finalClientName = client_name?.trim() || proposal.client_name || "Client";
    const signDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const monthlyFee = proposal.monthly_fee
      ? Number(proposal.monthly_fee).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 })
      : "$0";

    if (finalClientEmail) {
      const clientHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Inter, Arial, sans-serif; background-color: #ffffff; padding: 40px 25px;">
        <h1 style="font-size: 24px; font-weight: bold; color: #0d0d0d; margin: 0 0 20px;">Contract and NDA Signed Successfully</h1>
        <p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 10px;">Hi ${finalClientName.replace(/</g, "&lt;")},</p>
        <p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 25px;">Your AI & Automation Services Contract and NDA with Vektiss LLC have been signed successfully.</p>
        <div style="background-color: #f5f5f5; border-left: 4px solid hsl(213, 100%, 58%); padding: 16px; border-radius: 6px; margin: 0 0 25px;">
          <p style="font-size: 14px; color: #333; line-height: 1.8; margin: 0;">
            <strong>Signed by:</strong> ${signed_name.trim().replace(/</g, "&lt;")}<br/>
            <strong>Date:</strong> ${signDate}<br/>
            <strong>Monthly Fee:</strong> ${monthlyFee}/mo
          </p>
        </div>
        <p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 25px;">A PDF copy of your signed contract will be available in your client portal once your account is set up. If you have any questions, please contact us at <a href="mailto:info@vektiss.com" style="color: hsl(213, 100%, 58%);">info@vektiss.com</a>.</p>
        <p style="font-size: 12px; color: #999999; margin: 30px 0 0;">This is an automated notification from Vektiss LLC.</p>
      </body></html>`;

      try {
        const { error: clientEmailError } = await supabaseAdmin.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            to: finalClientEmail,
            from: "Vektiss <client@vektiss.com>",
            sender_domain: "vektiss.com",
            subject: "Your Vektiss Contract and NDA Have Been Signed",
            html: clientHtml,
            text: `Hi ${finalClientName}, your AI & Automation Services Contract and NDA with Vektiss LLC were signed by ${signed_name.trim()} on ${signDate}.`,
            purpose: "transactional",
            label: "contract_signed_client",
            message_id: crypto.randomUUID(),
            queued_at: new Date().toISOString(),
          },
        });
        if (clientEmailError) throw clientEmailError;
      } catch (emailErr) {
        console.error("Client email enqueue failed (non-blocking):", emailErr);
      }
    }

    // Send email notification to Vektiss
    try {
      const adminHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Inter, Arial, sans-serif; background-color: #ffffff; padding: 40px 25px;">
        <h1 style="font-size: 24px; font-weight: bold; color: #0d0d0d; margin: 0 0 20px;">Contract and NDA Signed</h1>
        <p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 25px;">A client completed both the contract and NDA. Here are the details:</p>
        <div style="background-color: #f5f5f5; border-left: 4px solid hsl(213, 100%, 58%); padding: 16px; border-radius: 6px; margin: 0 0 25px;">
          <p style="font-size: 14px; color: #333; line-height: 1.8; margin: 0;">
            <strong>Client:</strong> ${finalClientName.replace(/</g, "&lt;")}<br/>
            <strong>Company:</strong> ${(company_name?.trim() || proposal.company_name || "N/A").replace(/</g, "&lt;")}<br/>
            <strong>Email:</strong> ${(finalClientEmail || "N/A").replace(/</g, "&lt;")}<br/>
            <strong>Signed by:</strong> ${signed_name.trim().replace(/</g, "&lt;")}<br/>
            <strong>Date:</strong> ${signDate}<br/>
            <strong>Monthly Fee:</strong> ${monthlyFee}/mo<br/>
            <strong>Setup Fee:</strong> ${proposal.setup_fee ? Number(proposal.setup_fee).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }) : "$0"}
          </p>
        </div>
        <a href="https://portal.vektiss.com/admin/proposals" style="display: inline-block; background-color: hsl(213, 100%, 58%); color: #ffffff; font-size: 14px; font-weight: 600; border-radius: 6px; padding: 12px 24px; text-decoration: none;">View in Dashboard</a>
        <p style="font-size: 12px; color: #999999; margin: 30px 0 0;">This is an automated notification from Vektiss.</p>
      </body></html>`;

      const { error: adminEmailError } = await supabaseAdmin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          to: "info@vektiss.com",
          from: "Vektiss <client@vektiss.com>",
          sender_domain: "vektiss.com",
          subject: `Contract and NDA Signed: ${finalClientName} — ${(company_name?.trim() || proposal.company_name || "")}`,
          html: adminHtml,
          text: `Contract and NDA signed by ${signed_name.trim()} (${finalClientName}) on ${signDate}. Monthly: ${monthlyFee}/mo.`,
          purpose: "transactional",
          label: "contract_signed_admin",
          message_id: crypto.randomUUID(),
          queued_at: new Date().toISOString(),
        },
      });
      if (adminEmailError) throw adminEmailError;
    } catch (emailErr) {
      console.error("Admin email enqueue failed (non-blocking):", emailErr);
    }

    // Notify staff in the portal even if email delivery is temporarily unavailable.
    try {
      const { data: staff, error: staffError } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "ops"]);
      if (staffError) throw staffError;

      const notifications = (staff || []).map(({ user_id }: { user_id: string }) => ({
        user_id,
        title: "Contract and NDA signed",
        body: `${finalClientName} completed the contract and NDA on ${signDate}.`,
        type: "proposal",
        link: "/admin/proposals",
      }));
      if (notifications.length > 0) {
        const { error: notificationError } = await supabaseAdmin
          .from("notifications")
          .insert(notifications);
        if (notificationError) throw notificationError;
      }
    } catch (notificationErr) {
      console.error("Staff notification failed (non-blocking):", notificationErr);
    }

    // The queue's database wake-up needs a Vault credential that may not be
    // configured. Edge Functions already have the protected service key, so a
    // signing request can safely wake the worker after both messages are queued.
    try {
      const workerSecret = Deno.env.get("EMAIL_QUEUE_WORKER_SECRET");
      const queueResponse = await fetch(`${supabaseUrl}/functions/v1/process-email-queue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(workerSecret
            ? { "X-Email-Worker-Secret": workerSecret }
            : { "Authorization": `Bearer ${serviceRoleKey}` }),
        },
        body: "{}",
      });
      if (!queueResponse.ok) {
        console.error("Email queue wake returned an error:", await queueResponse.text());
      }
    } catch (queueErr) {
      console.error("Email queue wake failed (non-blocking):", queueErr);
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
