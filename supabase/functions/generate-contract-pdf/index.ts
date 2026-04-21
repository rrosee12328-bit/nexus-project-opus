import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Use jsPDF for PDF generation in Deno
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Contract template (mirrored from src/lib/contractTemplate.ts) ── */

const CONTRACT_SECTIONS = [
  {
    title: "1. EFFECTIVE DATE AND BACKGROUND",
    content: `1.1 Effective Date — The effective date of this Contract (the "Effective Date") shall be {{EFFECTIVE_DATE}}.

1.2 Background — Vektiss is engaged in the business of providing artificial intelligence ("AI")-powered systems, digital automation services, workflow integrations, messaging assistants, email assistants, technical consulting, and related services to businesses. Client desires to engage Vektiss to provide certain Services (as defined below) in connection with Client's business operations, subject to the terms and conditions set forth in this Contract.

1.3 Binding Nature — By signing this Contract, Client acknowledges and agrees that this is a legally binding agreement, that Client has had an opportunity to review it, and that Client agrees to be bound by its terms.`,
  },
  {
    title: "2. PARTIES AND CONTACT INFORMATION",
    content: `2.1 Contractor
Vektiss LLC — Texas Limited Liability Company
525 N Sam Houston Pkwy E, Suite 670, Houston, TX 77060
Email: info@vektiss.com

2.2 Client
Client Name: {{CLIENT_NAME}}
Client Number: {{CLIENT_NUMBER}}
Business Name: {{COMPANY_NAME}}
Client Address: {{CLIENT_ADDRESS}}
Client Email: {{CLIENT_EMAIL}}

2.2A Project Reference
Project Name: {{PROJECT_NAME}}
Project Number: {{PROJECT_NUMBER}}

2.3 Updates to Contact Information — Each Party agrees to promptly notify the other Party in writing of any changes to its contact information.`,
  },
  {
    title: "3. DEFINITIONS",
    content: `"Services" means all services performed by Vektiss under this Contract, including the planning, design, development, configuration, integration, implementation, deployment, and support of AI systems, automations, messaging assistants, email assistants, data workflows, and related technology services.

"Deliverables" means all digital assets, system configurations, workflows, scripts, logic, prompts, automation structures, and other work product created by Vektiss.

"Client Data" means all data, content, information, materials, credentials, documentation, and files provided by Client to Vektiss.

"External Service Providers" means any third-party platforms, cloud services, APIs, hosting providers, or other infrastructure not owned or controlled by Vektiss.

"Project Scope" means any written description of work, proposal, quote, or invoice describing the specific Services to be provided.

"Change Order" means a written agreement modifying the Project Scope.

"Monthly Service" means ongoing service, maintenance, updates, monitoring, and support billed on a recurring monthly basis.

"Subscription Term" means each one-month period for which Client is subscribed to a Monthly Service.`,
  },
  {
    title: "3A. FEES, COMPENSATION, AND PAYMENT STRUCTURE",
    content: `3A.1 General Payment Obligation — Client agrees to pay all fees as described herein. All fees are non-refundable.

{{FEE_BLOCK}}

3A.X Effect of Nonpayment — If Client fails to timely pay any fee, Vektiss may suspend, limit, or deactivate the relevant systems until all outstanding amounts are paid.`,
  },
  {
    title: "4. TERM AND DURATION",
    content: `4.1 Initial Term — The initial term shall commence on the Effective Date and continue until completion of the Services, unless earlier terminated.

4.2 Ongoing and Recurring Services — For any Monthly Service, this Contract shall continue on a month-to-month basis.

4.3 Survival — Provisions relating to Intellectual Property, Payment Obligations, Disclaimers, Indemnification, Limitation of Liability, Governing Law, Arbitration, and Confidentiality shall survive termination.`,
  },
  {
    title: "5. SCOPE OF SERVICES AND DELIVERABLES",
    content: `5.1 Services — Vektiss shall provide the Services described in the applicable Project Scope, including:
- Design and configuration of AI assistants or chat-based systems
- Implementation of automated workflows, triggers, and processes
- Integration with External Service Providers
- Development of AI email and messaging assistants
- Technical consulting and strategy related to AI and automation

{{SCOPE_BLOCK}}

{{SERVICES_DESCRIPTION}}

5.2 Deliverables — Deliverables will be considered accepted when delivered and functional.

5.3 No Obligation Beyond Scope — Vektiss shall not be obligated to provide Services not listed in the Project Scope.

5.4 Revisions — Substantial changes may require additional fees and a Change Order.`,
  },
  {
    title: "6. INDEPENDENT CONTRACTOR RELATIONSHIP",
    content: `6.1 Status — Vektiss is an independent contractor. Nothing in this Contract creates a partnership, joint venture, or employer-employee relationship.

6.2 No Authority to Bind — Vektiss has no authority to bind Client to any third party.`,
  },
  {
    title: "7. NO GUARANTEE OF RESULTS",
    content: `7.1 Vektiss does not guarantee any particular level of performance, revenue, profit, or engagement.

7.2 Results depend on numerous factors including Client's operations, data quality, and market conditions.

7.3 Client agrees not to rely on prior statements as guarantees of performance.`,
  },
  {
    title: "8. USE OF EXTERNAL SERVICE PROVIDERS",
    content: `8.1 Many Services require integration with External Service Providers operating independently from Vektiss.

8.2 Vektiss shall not be liable for delays, interruptions, or issues caused by External Service Providers.

8.3 Client is responsible for procuring and maintaining accounts with External Service Providers.`,
  },
  {
    title: "9. CLIENT DATA, PRIVACY, AND SECURITY",
    content: `9.1 Client retains ownership of all Client Data.

9.2 Vektiss shall use Client Data solely for providing the Services.

9.3 Vektiss shall not mine, resell, or commercially exploit Client Data.

9.4 Client is responsible for security of its own accounts and access credentials.

9.5 Data transmitted online may not be completely secure; Vektiss will take commercially reasonable security steps.`,
  },
  {
    title: "10. INTELLECTUAL PROPERTY RIGHTS",
    content: `10.1 All processes, methods, templates, and components developed by Vektiss remain Vektiss's exclusive property.

10.2 Subject to full payment, Vektiss grants Client a limited, non-exclusive license to use the Deliverables.

10.3 Client may not sell, license, copy, modify, or distribute Deliverables except as expressly permitted.

10.4 Client retains all rights in its own logos, trademarks, and proprietary content.`,
  },
  {
    title: "11. CLIENT RESPONSIBILITIES",
    content: `11.1 Client shall promptly provide all information, access, and approvals necessary for the Services.

11.2 Client is responsible for the accuracy of information provided.

11.3 Client is responsible for how the Deliverables are used by its personnel and customers.`,
  },
  {
    title: "12-13. PAYMENT TERMS AND LATE PAYMENTS",
    content: `12.1 Invoices are due upon receipt unless otherwise stated.

12.2 All amounts in U.S. Dollars (USD).

12.3 All payments are non-refundable.

13.1 Late payments may be subject to a 5% fee plus a $25 administrative fee.

13.2 Vektiss may suspend Services if invoices remain unpaid.

13.3 Reactivation may require payment of all outstanding amounts plus a reactivation fee.`,
  },
  {
    title: "14. TERMINATION",
    content: `14.1 Either Party may terminate upon written notice.

14.2 Vektiss may terminate immediately if Client fails to pay, materially breaches, or misuses Deliverables.

14.3 Upon termination, Client shall pay all amounts due. No refunds shall be given.`,
  },
  {
    title: "15-18. WARRANTY, LIABILITY, INDEMNIFICATION, FORCE MAJEURE",
    content: `15. All Services and Deliverables are provided "AS IS" without warranty of any kind.

16. Vektiss shall not be liable for indirect, incidental, consequential, or punitive damages. Total liability shall not exceed total fees paid by Client.

17. Client agrees to indemnify and hold harmless Vektiss from claims arising from Client's use of the Deliverables.

18. Vektiss shall not be liable for delays caused by circumstances beyond its reasonable control.`,
  },
  {
    title: "19-28. ADDITIONAL PROVISIONS",
    content: `19. Confidentiality — Each Party shall protect the other's Confidential Information.

20. Governing Law — This Contract is governed by the laws of the State of Texas.

21. Dispute Resolution — Disputes shall be resolved by binding arbitration in Harris County, Texas. No class actions. Jury trial waived.

22. Notices — All notices shall be in writing to the addresses listed in Section 2.

23. Portfolio Reference — Client grants Vektiss permission to reference Client's name in portfolio materials unless expressly objecting.

24. Severability — Invalid provisions shall not affect remaining provisions.

25. Entire Agreement — This Contract and all Project Scopes constitute the entire agreement.

26. Amendments — Must be in writing and signed by both Parties.

27. Assignment — Client may not assign without Vektiss's written consent.

28. Waiver — Failure to enforce a provision shall not waive future enforcement.

29. Electronic Signatures — Electronic signatures shall be deemed valid and binding.`,
  },
];

function formatCurrency(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0 });
}

function renderSections(data: {
  clientName: string;
  companyName: string;
  clientAddress: string;
  clientEmail: string;
  setupFee: number;
  monthlyFee: number;
  servicesDescription?: string;
  effectiveDate: string;
  proposalType?: "hourly" | "project" | "retainer";
  hourlyRate?: number;
  projectTotal?: number;
  scopeDescription?: string;
  deliverables?: string;
  timeline?: string;
}): { title: string; content: string }[] {
  const servicesBlock = data.servicesDescription
    ? `\n\nAdditional Services Description:\n${data.servicesDescription}`
    : "";

  const proposalType = data.proposalType || "retainer";
  const fmt = formatCurrency;

  let feeBlock = "";
  if (proposalType === "hourly") {
    feeBlock = `3A.2 Hourly Rate Engagement — Client engages Vektiss on an hourly basis at a rate of ${fmt(data.hourlyRate || 0)} per hour. Time will be tracked and invoiced as worked. Invoices are due upon receipt.

3A.3 No Recurring Fee — This engagement does not include a fixed monthly retainer or one-time setup fee unless otherwise stated in writing. Either party may discontinue the engagement upon written notice; Client remains obligated for hours already worked.`;
  } else if (proposalType === "project") {
    feeBlock = `3A.2 Fixed Project Fee — Client shall pay a fixed project fee of ${fmt(data.projectTotal || 0)} for the Services described in Section 5. Payment terms: 50% upon execution of this Contract and 50% upon delivery, unless otherwise agreed in writing.

3A.3 No Ongoing Obligation — Upon completion and final payment, neither party has any further financial obligation under this Contract beyond the surviving provisions.`;
  } else {
    feeBlock = `3A.2 One-Time Setup and Build Fee — Client shall pay a one-time setup fee of ${fmt(data.setupFee)} covering initial planning, configuration, development, integration, and deployment.

3A.3 Monthly Service Fee — Monthly Service Fee Amount: ${fmt(data.monthlyFee)} per month, which may include:
- Updates to AI prompts, responses, messaging, and logic
- Technical troubleshooting and issue resolution
- Monitoring system stability and performance
- Adjustments for compatibility with External Service Providers
- Updates to knowledge-bases or training materials
- Routine support and guidance

3A.4 Automatic Renewal — The Monthly Service will automatically renew on a month-to-month basis unless Client provides at least thirty (30) days' written notice of cancellation.

3A.5 Exclusions — The Monthly Service Fee does not cover new projects, new automations, major redesigns, or expanded scope beyond the original Deliverables.`;
  }

  const scopeParts: string[] = [];
  if (data.scopeDescription?.trim()) scopeParts.push(`Scope of Work:\n${data.scopeDescription.trim()}`);
  if (data.deliverables?.trim()) scopeParts.push(`Deliverables:\n${data.deliverables.trim()}`);
  if (data.timeline?.trim()) scopeParts.push(`Timeline:\n${data.timeline.trim()}`);
  const scopeBlock = scopeParts.length ? scopeParts.join("\n\n") : "";

  return CONTRACT_SECTIONS.map((s) => ({
    title: s.title,
    content: s.content
      .replace(/\{\{CLIENT_NAME\}\}/g, data.clientName || "_______________")
      .replace(/\{\{COMPANY_NAME\}\}/g, data.companyName || "_______________")
      .replace(/\{\{CLIENT_ADDRESS\}\}/g, data.clientAddress || "_______________")
      .replace(/\{\{CLIENT_EMAIL\}\}/g, data.clientEmail || "_______________")
      .replace(/\{\{SETUP_FEE\}\}/g, formatCurrency(data.setupFee))
      .replace(/\{\{MONTHLY_FEE\}\}/g, formatCurrency(data.monthlyFee))
      .replace(/\{\{HOURLY_RATE\}\}/g, formatCurrency(data.hourlyRate || 0))
      .replace(/\{\{PROJECT_TOTAL\}\}/g, formatCurrency(data.projectTotal || 0))
      .replace(/\{\{FEE_BLOCK\}\}/g, feeBlock)
      .replace(/\{\{SCOPE_BLOCK\}\}/g, scopeBlock)
      .replace(/\{\{SERVICES_DESCRIPTION\}\}/g, servicesBlock)
      .replace(/\{\{EFFECTIVE_DATE\}\}/g, data.effectiveDate),
  }));
}

/* ── PDF Generation ── */

function generateContractPdf(
  sections: { title: string; content: string }[],
  signedName: string,
  signedAt: string,
): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 25;
  const marginRight = 25;
  const maxWidth = pageWidth - marginLeft - marginRight;
  const lineHeight = 5.5;
  const bottomMargin = 30;

  let y = 25;

  const checkPage = (needed: number) => {
    if (y + needed > pageHeight - bottomMargin) {
      doc.addPage();
      y = 25;
    }
  };

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("AI & AUTOMATION SERVICES CONTRACT", pageWidth / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Vektiss LLC", pageWidth / 2, y, { align: "center" });
  y += 12;

  // Sections
  for (const section of sections) {
    checkPage(20);

    // Section title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const titleLines = doc.splitTextToSize(section.title, maxWidth);
    for (const line of titleLines) {
      checkPage(lineHeight + 2);
      doc.text(line, marginLeft, y);
      y += lineHeight + 1;
    }
    y += 2;

    // Section content
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const contentLines = doc.splitTextToSize(section.content, maxWidth);
    for (const line of contentLines) {
      checkPage(lineHeight);
      doc.text(line, marginLeft, y);
      y += lineHeight;
    }
    y += 6;
  }

  // Signature block
  checkPage(50);
  y += 5;
  doc.setDrawColor(200, 200, 200);
  doc.line(marginLeft, y, pageWidth - marginRight, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("SIGNATURES", marginLeft, y);
  y += 10;

  // Client signature
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Client:", marginLeft, y);
  y += 7;

  doc.setFont("courier", "bold");
  doc.setFontSize(14);
  doc.text(signedName, marginLeft, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const signDate = new Date(signedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.text(`Digitally signed on ${signDate}`, marginLeft, y);
  y += 12;

  // Vektiss signature
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Vektiss LLC:", marginLeft, y);
  y += 7;

  doc.setFont("courier", "bold");
  doc.setFontSize(14);
  doc.text("Vektiss LLC — Authorized", marginLeft, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Date: ${signDate}`, marginLeft, y);

  // Footer on every page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Vektiss LLC — Confidential — Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 12,
      { align: "center" },
    );
    doc.setTextColor(0, 0, 0);
  }

  return doc.output("arraybuffer") as unknown as Uint8Array;
}

/* ── Main handler ── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { proposal_id, admin_generate } = await req.json();

    if (!proposal_id) {
      return new Response(
        JSON.stringify({ error: "proposal_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch proposal
    const { data: proposal, error: fetchErr } = await supabaseAdmin
      .from("proposals")
      .select("*")
      .eq("id", proposal_id)
      .single();

    if (fetchErr || !proposal) {
      return new Response(
        JSON.stringify({ error: "Proposal not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // For admin_generate mode, signature is not required (admin generated, no client sign)
    if (!admin_generate && (!proposal.signed_at || !proposal.signed_name)) {
      return new Response(
        JSON.stringify({ error: "Proposal has not been signed yet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Render contract sections
    const sections = renderSections({
      clientName: proposal.client_name || "",
      companyName: proposal.company_name || "",
      clientAddress: proposal.client_address || "",
      clientEmail: proposal.client_email || "",
      setupFee: Number(proposal.setup_fee) || 0,
      monthlyFee: Number(proposal.monthly_fee) || 0,
      servicesDescription: proposal.services_description || undefined,
      effectiveDate: new Date(proposal.signed_at || new Date()).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      proposalType: (proposal.proposal_type as any) || "retainer",
      hourlyRate: Number(proposal.hourly_rate) || 0,
      projectTotal: Number(proposal.project_total) || 0,
      scopeDescription: proposal.scope_description || undefined,
      deliverables: proposal.deliverables || undefined,
      timeline: proposal.timeline || undefined,
    });

    // Generate PDF
    const signedName = proposal.signed_name || "Vektiss LLC (Admin Generated)";
    const signedAt = proposal.signed_at || new Date().toISOString();
    const pdfBytes = generateContractPdf(sections, signedName, signedAt);

    // Upload to storage
    const clientId = proposal.client_id;
    const suffix = admin_generate ? "admin" : "signed";
    const fileName = `contract-${proposal.id.slice(0, 8)}-${suffix}.pdf`;
    const storagePath = clientId ? `${clientId}/${fileName}` : fileName;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("client-assets")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error("Failed to upload contract PDF: " + uploadError.message);
    }

    // Update proposal with PDF path
    await supabaseAdmin
      .from("proposals")
      .update({ contract_pdf_path: storagePath })
      .eq("id", proposal.id);

    // Also create an asset record so it shows up in the client's assets
    if (clientId) {
      await supabaseAdmin.from("assets").insert({
        client_id: clientId,
        file_name: fileName,
        file_path: storagePath,
        file_size: pdfBytes.byteLength || (pdfBytes as any).length || 0,
        file_type: "application/pdf",
        category: "contract",
        uploaded_by: proposal.created_by,
      });

      // Also persist a client_contracts record so it appears in the contracts list
      await supabaseAdmin.from("client_contracts").insert({
        client_id: clientId,
        proposal_id: proposal.id,
        title: `${(proposal.proposal_type || "retainer").toString().toUpperCase()} Contract — ${proposal.client_name || "Client"}`,
        file_path: storagePath,
        contract_type: admin_generate ? "admin_generated" : "signed",
        setup_fee: Number(proposal.setup_fee) || 0,
        monthly_fee: Number(proposal.monthly_fee) || 0,
        signed_at: proposal.signed_at,
        signed_by: proposal.signed_name,
        uploaded_by: proposal.created_by,
      });
    }

    return new Response(
      JSON.stringify({ success: true, path: storagePath }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("generate-contract-pdf error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
