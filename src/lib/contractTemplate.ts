/**
 * Contract template sections for the Vektiss AI & Automation Services Contract.
 * Placeholders: {{CLIENT_NAME}}, {{COMPANY_NAME}}, {{CLIENT_ADDRESS}}, {{CLIENT_EMAIL}},
 *               {{SETUP_FEE}}, {{MONTHLY_FEE}}, {{SERVICES_DESCRIPTION}}, {{EFFECTIVE_DATE}}
 */

export const CONTRACT_SECTIONS = [
  {
    title: "1. EFFECTIVE DATE AND BACKGROUND",
    content: `**1.1 Effective Date** — The effective date of this Contract (the "Effective Date") shall be {{EFFECTIVE_DATE}}.

**1.2 Background** — Vektiss is engaged in the business of providing artificial intelligence ("AI")‑powered systems, digital automation services, workflow integrations, messaging assistants, email assistants, technical consulting, and related services to businesses. Client desires to engage Vektiss to provide certain Services (as defined below) in connection with Client's business operations, subject to the terms and conditions set forth in this Contract.

**1.3 Binding Nature** — By signing this Contract, Client acknowledges and agrees that this is a legally binding agreement, that Client has had an opportunity to review it, and that Client agrees to be bound by its terms.`,
  },
  {
    title: "2. PARTIES AND CONTACT INFORMATION",
    content: `**2.1 Contractor**
Vektiss LLC — Texas Limited Liability Company
525 N Sam Houston Pkwy E, Suite 670, Houston, TX 77060
Email: info@vektiss.com

**2.2 Client**
Client Name: {{CLIENT_NAME}}
Business Name: {{COMPANY_NAME}}
Client Address: {{CLIENT_ADDRESS}}
Client Email: {{CLIENT_EMAIL}}

**2.3 Updates to Contact Information** — Each Party agrees to promptly notify the other Party in writing of any changes to its contact information.`,
  },
  {
    title: "3. DEFINITIONS",
    content: `"Services" means all services performed by Vektiss under this Contract, including the planning, design, development, configuration, integration, implementation, deployment, and support of AI systems, automations, messaging assistants, email assistants, data workflows, and related technology services.

"Deliverables" means all digital assets, system configurations, workflows, scripts, logic, prompts, automation structures, and other work product created by Vektiss.

"Client Data" means all data, content, information, materials, credentials, documentation, and files provided by Client to Vektiss.

"External Service Providers" means any third‑party platforms, cloud services, APIs, hosting providers, or other infrastructure not owned or controlled by Vektiss.

"Project Scope" means any written description of work, proposal, quote, or invoice describing the specific Services to be provided.

"Change Order" means a written agreement modifying the Project Scope.

"Monthly Service" means ongoing service, maintenance, updates, monitoring, and support billed on a recurring monthly basis.

"Subscription Term" means each one‑month period for which Client is subscribed to a Monthly Service.`,
  },
  {
    title: "3A. FEES, COMPENSATION, AND PAYMENT STRUCTURE",
    content: `**3A.1 General Payment Obligation** — Client agrees to pay all fees as described herein. All fees are non-refundable.

**3A.2 One-Time Setup and Build Fee** — Client shall pay a one‑time setup fee of **{{SETUP_FEE}}** covering initial planning, configuration, development, integration, and deployment.

**3A.3 Monthly Service Fee** — Monthly Service Fee Amount: **{{MONTHLY_FEE}}** per month, which may include:
• Updates to AI prompts, responses, messaging, and logic
• Technical troubleshooting and issue resolution
• Monitoring system stability and performance
• Adjustments for compatibility with External Service Providers
• Updates to knowledge‑bases or training materials
• Routine support and guidance

**3A.4 Automatic Renewal** — The Monthly Service will automatically renew on a month‑to‑month basis unless Client provides at least thirty (30) days' written notice of cancellation.

**3A.5 Effect of Nonpayment** — If Client fails to timely pay any fee, Vektiss may suspend, limit, or deactivate the relevant systems until all outstanding amounts are paid.

**3A.6 Exclusions** — The Monthly Service Fee does not cover new projects, new automations, major redesigns, or expanded scope beyond the original Deliverables.`,
  },
  {
    title: "4. TERM AND DURATION",
    content: `**4.1 Initial Term** — The initial term shall commence on the Effective Date and continue until completion of the Services, unless earlier terminated.

**4.2 Ongoing and Recurring Services** — For any Monthly Service, this Contract shall continue on a month‑to‑month basis.

**4.3 Survival** — Provisions relating to Intellectual Property, Payment Obligations, Disclaimers, Indemnification, Limitation of Liability, Governing Law, Arbitration, and Confidentiality shall survive termination.`,
  },
  {
    title: "5. SCOPE OF SERVICES AND DELIVERABLES",
    content: `**5.1 Services** — Vektiss shall provide the Services described in the applicable Project Scope, including:
• Design and configuration of AI assistants or chat‑based systems
• Implementation of automated workflows, triggers, and processes
• Integration with External Service Providers
• Development of AI email and messaging assistants
• Technical consulting and strategy related to AI and automation

{{SERVICES_DESCRIPTION}}

**5.2 Deliverables** — Deliverables will be considered accepted when delivered and functional.

**5.3 No Obligation Beyond Scope** — Vektiss shall not be obligated to provide Services not listed in the Project Scope.

**5.4 Revisions** — Substantial changes may require additional fees and a Change Order.`,
  },
  {
    title: "6. INDEPENDENT CONTRACTOR RELATIONSHIP",
    content: `**6.1 Status** — Vektiss is an independent contractor. Nothing in this Contract creates a partnership, joint venture, or employer‑employee relationship.

**6.2 No Authority to Bind** — Vektiss has no authority to bind Client to any third party.`,
  },
  {
    title: "7. NO GUARANTEE OF RESULTS",
    content: `**7.1** Vektiss does not guarantee any particular level of performance, revenue, profit, or engagement.

**7.2** Results depend on numerous factors including Client's operations, data quality, and market conditions.

**7.3** Client agrees not to rely on prior statements as guarantees of performance.`,
  },
  {
    title: "8. USE OF EXTERNAL SERVICE PROVIDERS",
    content: `**8.1** Many Services require integration with External Service Providers operating independently from Vektiss.

**8.2** Vektiss shall not be liable for delays, interruptions, or issues caused by External Service Providers.

**8.3** Client is responsible for procuring and maintaining accounts with External Service Providers.`,
  },
  {
    title: "9. CLIENT DATA, PRIVACY, AND SECURITY",
    content: `**9.1** Client retains ownership of all Client Data.

**9.2** Vektiss shall use Client Data solely for providing the Services.

**9.3** Vektiss shall not mine, resell, or commercially exploit Client Data.

**9.4** Client is responsible for security of its own accounts and access credentials.

**9.5** Data transmitted online may not be completely secure; Vektiss will take commercially reasonable security steps.`,
  },
  {
    title: "10. INTELLECTUAL PROPERTY RIGHTS",
    content: `**10.1** All processes, methods, templates, and components developed by Vektiss remain Vektiss's exclusive property.

**10.2** Subject to full payment, Vektiss grants Client a limited, non‑exclusive license to use the Deliverables.

**10.3** Client may not sell, license, copy, modify, or distribute Deliverables except as expressly permitted.

**10.4** Client retains all rights in its own logos, trademarks, and proprietary content.`,
  },
  {
    title: "11. CLIENT RESPONSIBILITIES",
    content: `**11.1** Client shall promptly provide all information, access, and approvals necessary for the Services.

**11.2** Client is responsible for the accuracy of information provided.

**11.3** Client is responsible for how the Deliverables are used by its personnel and customers.`,
  },
  {
    title: "12–13. PAYMENT TERMS AND LATE PAYMENTS",
    content: `**12.1** Invoices are due upon receipt unless otherwise stated.

**12.2** All amounts in U.S. Dollars (USD).

**12.3** All payments are non‑refundable.

**13.1** Late payments may be subject to a 5% fee plus a $25 administrative fee.

**13.2** Vektiss may suspend Services if invoices remain unpaid.

**13.3** Reactivation may require payment of all outstanding amounts plus a reactivation fee.`,
  },
  {
    title: "14. TERMINATION",
    content: `**14.1** Either Party may terminate upon written notice.

**14.2** Vektiss may terminate immediately if Client fails to pay, materially breaches, or misuses Deliverables.

**14.3** Upon termination, Client shall pay all amounts due. No refunds shall be given.`,
  },
  {
    title: "15–18. WARRANTY, LIABILITY, INDEMNIFICATION, FORCE MAJEURE",
    content: `**15.** All Services and Deliverables are provided "AS IS" without warranty of any kind.

**16.** Vektiss shall not be liable for indirect, incidental, consequential, or punitive damages. Total liability shall not exceed total fees paid by Client.

**17.** Client agrees to indemnify and hold harmless Vektiss from claims arising from Client's use of the Deliverables.

**18.** Vektiss shall not be liable for delays caused by circumstances beyond its reasonable control.`,
  },
  {
    title: "19–28. ADDITIONAL PROVISIONS",
    content: `**19. Confidentiality** — Each Party shall protect the other's Confidential Information.

**20. Governing Law** — This Contract is governed by the laws of the State of Texas.

**21. Dispute Resolution** — Disputes shall be resolved by binding arbitration in Harris County, Texas. No class actions. Jury trial waived.

**22. Notices** — All notices shall be in writing to the addresses listed in Section 2.

**23. Portfolio Reference** — Client grants Vektiss permission to reference Client's name in portfolio materials unless expressly objecting.

**24. Severability** — Invalid provisions shall not affect remaining provisions.

**25. Entire Agreement** — This Contract and all Project Scopes constitute the entire agreement.

**26. Amendments** — Must be in writing and signed by both Parties.

**27. Assignment** — Client may not assign without Vektiss's written consent.

**28. Waiver** — Failure to enforce a provision shall not waive future enforcement.

**29. Electronic Signatures** — Electronic signatures shall be deemed valid and binding.`,
  },
];

export function renderContract(data: {
  clientName: string;
  companyName: string;
  clientAddress: string;
  clientEmail: string;
  setupFee: number;
  monthlyFee: number;
  servicesDescription?: string;
  effectiveDate?: string;
}): { title: string; content: string }[] {
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

  const date = data.effectiveDate || new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const servicesBlock = data.servicesDescription
    ? `\n\n**Additional Services Description:**\n${data.servicesDescription}`
    : "";

  return CONTRACT_SECTIONS.map((s) => ({
    title: s.title,
    content: s.content
      .replace(/\{\{CLIENT_NAME\}\}/g, data.clientName || "_______________")
      .replace(/\{\{COMPANY_NAME\}\}/g, data.companyName || "_______________")
      .replace(/\{\{CLIENT_ADDRESS\}\}/g, data.clientAddress || "_______________")
      .replace(/\{\{CLIENT_EMAIL\}\}/g, data.clientEmail || "_______________")
      .replace(/\{\{SETUP_FEE\}\}/g, fmt(data.setupFee))
      .replace(/\{\{MONTHLY_FEE\}\}/g, fmt(data.monthlyFee))
      .replace(/\{\{SERVICES_DESCRIPTION\}\}/g, servicesBlock)
      .replace(/\{\{EFFECTIVE_DATE\}\}/g, date),
  }));
}
