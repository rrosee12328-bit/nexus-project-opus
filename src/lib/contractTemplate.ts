/**
 * Contract template sections for the Vektiss AI & Automation Services Contract.
 * Supports three proposal types: hourly, project, retainer.
 * Placeholders: {{CLIENT_NAME}}, {{COMPANY_NAME}}, {{CLIENT_ADDRESS}}, {{CLIENT_EMAIL}},
 *               {{SETUP_FEE}}, {{MONTHLY_FEE}}, {{HOURLY_RATE}}, {{PROJECT_TOTAL}},
 *               {{SERVICES_DESCRIPTION}}, {{SCOPE_BLOCK}}, {{FEE_BLOCK}}, {{EFFECTIVE_DATE}}
 */

export type ProposalType = "hourly" | "project" | "retainer";

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
Client Number: {{CLIENT_NUMBER}}
Business Name: {{COMPANY_NAME}}
Client Address: {{CLIENT_ADDRESS}}
Client Email: {{CLIENT_EMAIL}}

**2.2A Project Reference**
Project Name: {{PROJECT_NAME}}
Project Number: {{PROJECT_NUMBER}}

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
    content: `**3A.1 General Payment Obligation** — Client agrees to pay all fees as described herein. All fees are non‑refundable.

{{FEE_BLOCK}}

**3A.X Effect of Nonpayment** — If Client fails to timely pay any fee, Vektiss may suspend, limit, or deactivate the relevant systems until all outstanding amounts are paid.`,
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

{{SCOPE_BLOCK}}

{{SERVICES_DESCRIPTION}}

**5.2 Deliverables** — Deliverables will be considered accepted when delivered and functional.

**5.3 No Obligation Beyond Scope** — Vektiss shall not be obligated to provide Services not listed in the Project Scope.

**5.4 Revisions** — Substantial changes may require additional fees and a Change Order.`,
  },
  {
    title: "6. INDEPENDENT CONTRACTOR RELATIONSHIP",
    content: `**6.1 Status** — Vektiss is engaged by Client solely as an independent contractor. Nothing in this Contract shall be construed to create a partnership, joint venture, agency, franchise, employer‑employee, or fiduciary relationship between the Parties. Vektiss retains sole and exclusive control over the manner, means, methods, schedule, tools, and personnel used to perform the Services.

**6.2 No Employee Benefits** — Vektiss and its personnel are not entitled to any employee benefits from Client, including but not limited to health insurance, retirement contributions, paid leave, workers' compensation, or unemployment insurance. Vektiss is solely responsible for all federal, state, and local taxes, withholdings, and contributions arising from amounts paid under this Contract.

**6.3 No Authority to Bind** — Neither Party shall have authority to make any representation, contract, commitment, or incur any liability on behalf of the other Party, except as expressly authorized in writing. Vektiss shall not represent itself as an employee, agent, or partner of Client to any third party.

**6.4 Subcontractors** — Vektiss may, at its discretion, retain subcontractors, contractors, or third‑party tools to perform any portion of the Services, provided that Vektiss remains responsible for the performance of such Services in accordance with this Contract.`,
  },
  {
    title: "7. NO GUARANTEE OF RESULTS",
    content: `**7.1 No Performance Guarantee** — Vektiss does not warrant or guarantee any particular outcome, return on investment, level of performance, revenue, profit, lead volume, conversion rate, engagement, ranking, traffic, or other commercial result arising from the Services or Deliverables. All projections, forecasts, estimates, examples, case studies, and illustrative numbers shared before, during, or after this Contract are aspirational only and shall not be deemed promises, warranties, or contractual commitments.

**7.2 Factors Outside Vektiss's Control** — Client expressly acknowledges that the success of any AI system, automation, marketing campaign, or advertising effort depends on numerous factors outside Vektiss's reasonable control, including but not limited to: the quality, accuracy, and completeness of Client Data; Client's internal operations, sales process, and follow‑up; market and economic conditions; competitor activity; consumer behavior; changes to External Service Provider policies, algorithms, pricing, or APIs; regulatory changes; and the responsiveness of Client and its personnel.

**7.3 No Reliance on Prior Statements** — Client agrees that any statements, examples, projections, or representations made before execution of this Contract — whether oral, written, in pitch decks, on calls, in emails, or in marketing materials — are superseded by this Contract and shall not be relied upon as guarantees of performance, deliverables, or results. The terms of this Contract control over any prior or contemporaneous communication.

**7.4 Marketing & Advertising Spend** — Where the Services involve advertising, lead generation, or paid media, Client acknowledges that ad spend, platform performance, audience response, cost per lead, cost per acquisition, and similar metrics fluctuate and are not guaranteed. Vektiss's compensation is for the work performed, not for results achieved by third‑party advertising platforms.`,
  },
  {
    title: "8. USE OF EXTERNAL SERVICE PROVIDERS",
    content: `**8.1 Reliance on Third Parties** — The Services often depend on, integrate with, or are delivered through External Service Providers, including but not limited to: Meta, Google, OpenAI, Anthropic, hosting and cloud providers, CRM platforms, payment processors, email and messaging providers, analytics tools, and other third‑party APIs. These providers operate independently of Vektiss and are governed by their own terms, policies, pricing, and service levels.

**8.2 No Liability for Third‑Party Failures** — Vektiss shall not be liable for any delay, interruption, downtime, data loss, account suspension, policy enforcement, ad disapproval, account ban, price change, feature deprecation, security incident, or other issue caused in whole or in part by an External Service Provider. Client's sole recourse for such issues is against the relevant External Service Provider.

**8.3 Client Accounts and Costs** — Client is solely responsible for procuring, maintaining, paying for, and ensuring continuous good standing of all accounts, subscriptions, licenses, ad credits, and credentials with External Service Providers required to deliver the Services. All third‑party fees, ad spend, API usage charges, and platform costs are paid directly by Client and are separate from and in addition to fees owed to Vektiss.

**8.4 Compliance with Third‑Party Terms** — Client warrants that its use of the Deliverables and any content, data, offers, or claims it provides to Vektiss complies with the terms of service, advertising policies, and applicable laws of every External Service Provider on which the Services are run. Vektiss is not responsible for content, claims, or compliance decisions made by Client.`,
  },
  {
    title: "9. CLIENT DATA, PRIVACY, AND SECURITY",
    content: `**9.1 Ownership of Client Data** — As between the Parties, Client retains all right, title, and interest in and to Client Data. Vektiss does not acquire any ownership interest in Client Data by virtue of providing the Services.

**9.2 Permitted Use** — Vektiss shall access and use Client Data solely for the purpose of providing, maintaining, improving, and supporting the Services and Deliverables under this Contract, and as otherwise required by law. Vektiss may use de‑identified, aggregated, or anonymized data derived from Client Data for internal analytics, model evaluation, benchmarking, and improvement of Vektiss's products and services.

**9.3 No Sale or Commercial Exploitation** — Vektiss shall not sell, rent, lease, or otherwise commercially exploit personally identifiable Client Data, nor disclose it to third parties except: (a) to subcontractors and External Service Providers reasonably necessary to perform the Services; (b) as required by applicable law, subpoena, or court order; or (c) with Client's prior written consent.

**9.4 Client Security Responsibilities** — Client is solely responsible for: (a) the security of its own systems, devices, networks, and accounts; (b) the safeguarding of its passwords, API keys, OAuth tokens, and other access credentials; (c) the lawful collection and provision of any personal data shared with Vektiss; (d) obtaining all consents and providing all notices required by applicable privacy laws (including GDPR, CCPA/CPRA, TCPA, CAN‑SPAM, and similar regulations) for any data processed under this Contract; and (e) honoring data subject requests received from end users.

**9.5 Reasonable Security** — Vektiss shall implement and maintain commercially reasonable administrative, technical, and physical safeguards designed to protect Client Data against unauthorized access, use, disclosure, alteration, or destruction. Notwithstanding such measures, Client acknowledges that no method of electronic transmission or storage is 100% secure, and Vektiss does not guarantee absolute security of any data.

**9.6 Data Breach Notification** — In the event Vektiss becomes aware of a confirmed unauthorized acquisition of Client Data within Vektiss's systems, Vektiss shall notify Client without undue delay and shall reasonably cooperate with Client in investigating and remediating the incident.

**9.7 Data Return / Deletion** — Upon termination of this Contract and Client's written request made within thirty (30) days of termination, Vektiss shall return or delete Client Data in its possession that is not required to be retained for legal, accounting, audit, or backup purposes.`,
  },
  {
    title: "10. INTELLECTUAL PROPERTY RIGHTS",
    content: `**10.1 Vektiss Background IP** — All processes, methodologies, frameworks, templates, prompt structures, system instructions, automation patterns, code libraries, internal tools, knowledge bases, training materials, software, and pre‑existing intellectual property used by Vektiss in performing the Services (collectively, "Vektiss Background IP") are and shall remain the sole and exclusive property of Vektiss. Nothing in this Contract assigns or transfers any ownership of Vektiss Background IP to Client.

**10.2 License to Deliverables** — Subject to Client's full and timely payment of all fees due under this Contract, Vektiss grants Client a limited, non‑exclusive, non‑transferable, non‑sublicensable, revocable license to use the Deliverables solely for Client's own internal business operations during the term of this Contract and any active Subscription Term. This license does not transfer ownership of any Deliverable.

**10.3 Restrictions** — Client shall not, and shall not permit any third party to: (a) sell, sublicense, lease, distribute, publish, or otherwise commercially exploit the Deliverables; (b) copy, modify, adapt, translate, reverse‑engineer, decompile, or create derivative works of the Deliverables, except as required to use them for their intended internal purpose; (c) remove or alter any proprietary notices; (d) use the Deliverables to build a competing product or service; or (e) provide access to the Deliverables to any third party without Vektiss's prior written consent.

**10.4 Client Materials** — Client retains all right, title, and interest in and to its trademarks, service marks, logos, brand assets, copy, images, video, audio, customer lists, and other content provided to Vektiss ("Client Materials"). Client grants Vektiss a non‑exclusive, royalty‑free license to use, copy, modify, display, and distribute Client Materials solely as necessary to perform the Services.

**10.5 Effect of Non‑Payment or Termination** — If Client fails to pay any fees when due, or upon termination of this Contract for any reason, Client's license to the Deliverables shall immediately and automatically suspend or terminate, and Client shall cease all use of the Deliverables until amounts are paid in full or until a new agreement is reached.

**10.6 Feedback** — Any suggestions, ideas, enhancement requests, feedback, or recommendations provided by Client regarding the Services or Deliverables may be used by Vektiss without restriction or compensation.`,
  },
  {
    title: "11. CLIENT RESPONSIBILITIES",
    content: `**11.1 Cooperation and Access** — Client shall promptly provide Vektiss with all information, content, brand assets, account access, credentials, approvals, decisions, and personnel availability reasonably required to perform the Services. Vektiss is not responsible for delays, missed timelines, or reduced results caused by Client's failure to do so, and any agreed timeline shall be extended accordingly.

**11.2 Accuracy of Information** — Client represents and warrants that all information, content, claims, offers, statistics, testimonials, and materials provided to Vektiss are accurate, lawful, non‑infringing, non‑deceptive, and compliant with all applicable laws and platform policies. Client shall indemnify Vektiss for any claim arising from inaccurate or unlawful Client‑provided content.

**11.3 Use of Deliverables** — Client is solely responsible for how the Deliverables are deployed, configured (after handoff), monitored, and used by Client's personnel, contractors, customers, and end users. Client shall ensure appropriate human review of automated outputs, AI‑generated content, and customer‑facing communications produced by the Deliverables.

**11.4 Approvals and Sign‑offs** — Where Vektiss requests Client review, approval, or sign‑off of campaigns, creative, copy, automations, prompts, or strategy, Client shall respond within a reasonable time. Materials, drafts, or proposals not objected to in writing within five (5) business days of delivery shall be deemed approved.

**11.5 Compliance** — Client shall comply with all laws applicable to its business, industry, and use of the Deliverables, including but not limited to consumer protection, advertising, financial services, data privacy, anti‑spam, and telemarketing laws. Client is responsible for obtaining any licenses, registrations, or disclosures required by Client's industry or jurisdiction.`,
  },
  {
    title: "12–13. PAYMENT TERMS AND LATE PAYMENTS",
    content: `**12.1 Invoicing and Due Dates** — Unless otherwise stated in the applicable Project Scope, all invoices are due upon receipt. Recurring Monthly Service Fees are billed in advance on the same calendar day each month and authorize automatic charge to the payment method on file.

**12.2 Currency** — All fees, expenses, and reimbursements under this Contract are stated and payable in United States Dollars (USD). Client is responsible for any currency conversion fees, foreign transaction fees, or bank charges associated with payment.

**12.3 Non‑Refundable** — All payments made to Vektiss are fully earned upon receipt and are non‑refundable, except where required by applicable law. Cancellation, dissatisfaction with results, change in business circumstances, or non‑use of the Services shall not entitle Client to any refund, credit, or pro‑ration.

**12.4 Taxes** — Fees are exclusive of all sales, use, value‑added, withholding, and similar taxes. Client is responsible for any such taxes imposed on the Services, except for taxes based on Vektiss's net income.

**12.5 Disputed Charges** — Client must notify Vektiss in writing of any good‑faith dispute over a charge within ten (10) business days of the invoice date. Failure to do so constitutes Client's acceptance of the charge.

**13.1 Late Payment Fee** — Any amount not paid when due shall accrue a late fee of five percent (5%) of the outstanding balance plus a twenty‑five dollar ($25) administrative fee, plus interest at the lower of one and one‑half percent (1.5%) per month or the maximum rate permitted by law, until paid in full.

**13.2 Suspension of Services** — If any invoice remains unpaid for more than seven (7) days past the due date, Vektiss may, in its sole discretion and without further notice, suspend, throttle, deactivate, or limit access to any portion of the Services, Deliverables, automations, or accounts under Vektiss's control until all amounts are paid.

**13.3 Reactivation** — Reactivation following suspension may require payment of all outstanding amounts (including late fees and interest) plus a reactivation fee equal to one (1) month of the then‑current Monthly Service Fee. Vektiss is not liable for any data, leads, opportunities, or business interruption resulting from suspension caused by non‑payment.

**13.4 Collection Costs** — Client shall pay all costs of collection incurred by Vektiss, including reasonable attorneys' fees, court costs, and collection agency fees, in connection with any past‑due amount.`,
  },
  {
    title: "14. TERMINATION",
    content: `**14.1 Termination for Convenience** — For Monthly Services, either Party may terminate this Contract for any reason or no reason by providing written notice to the other Party. For fixed‑term, milestone‑based, or project engagements, neither Party may terminate for convenience prior to completion except as expressly stated in the applicable Project Scope.

**14.2 Termination for Cause by Vektiss** — Vektiss may terminate this Contract or any Project Scope immediately upon written notice if Client: (a) fails to pay any fee when due and does not cure within five (5) days of notice; (b) materially breaches any provision of this Contract; (c) misuses the Deliverables or Vektiss Background IP; (d) provides false, misleading, or unlawful content; (e) becomes insolvent, files for bankruptcy, or makes an assignment for the benefit of creditors; or (f) engages in conduct that, in Vektiss's reasonable judgment, harms or risks harming Vektiss's reputation, accounts, or relationships with External Service Providers.

**14.3 Termination for Cause by Client** — Client may terminate this Contract upon written notice if Vektiss materially breaches this Contract and fails to cure such breach within thirty (30) days of receiving written notice describing the breach in reasonable detail.

**14.4 Effect of Termination** — Upon termination for any reason: (a) Client shall immediately pay all amounts due and owing through the effective date of termination, including any earned but unbilled fees and any non‑cancelable third‑party costs incurred on Client's behalf; (b) all licenses granted to Client under this Contract shall immediately terminate, and Client shall cease all use of the Deliverables and Vektiss Background IP; (c) Vektiss shall have no further obligation to perform the Services; (d) no refunds shall be given for any pre‑paid fees; and (e) the provisions identified in Section 4.3 shall survive.

**14.5 Transition Assistance** — At Client's written request and subject to payment of Vektiss's then‑current hourly rates, Vektiss may, in its discretion, provide reasonable transition assistance for up to thirty (30) days following termination.`,
  },
  {
    title: "15–18. WARRANTY, LIABILITY, INDEMNIFICATION, FORCE MAJEURE",
    content: `**15.1 Disclaimer of Warranties** — TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ALL SERVICES, DELIVERABLES, AUTOMATIONS, AI OUTPUTS, RECOMMENDATIONS, AND MATERIALS ARE PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTY OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE. VEKTISS SPECIFICALLY DISCLAIMS ALL IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON‑INFRINGEMENT, ACCURACY, AND THOSE ARISING FROM COURSE OF DEALING OR USAGE OF TRADE. VEKTISS DOES NOT WARRANT THAT THE SERVICES OR DELIVERABLES WILL BE UNINTERRUPTED, ERROR‑FREE, SECURE, OR FREE FROM HARMFUL COMPONENTS, OR THAT AI‑GENERATED OUTPUTS WILL BE ACCURATE, COMPLETE, OR APPROPRIATE FOR ANY PARTICULAR USE.

**16.1 Exclusion of Damages** — IN NO EVENT SHALL VEKTISS, ITS OFFICERS, MEMBERS, EMPLOYEES, CONTRACTORS, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOST PROFITS, LOST REVENUE, LOST BUSINESS OPPORTUNITY, LOSS OF GOODWILL, LOSS OF DATA, OR COST OF SUBSTITUTE SERVICES, ARISING OUT OF OR IN CONNECTION WITH THIS CONTRACT, EVEN IF VEKTISS HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

**16.2 Cap on Liability** — VEKTISS'S TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THIS CONTRACT, WHETHER IN CONTRACT, TORT (INCLUDING NEGLIGENCE), STRICT LIABILITY, OR OTHERWISE, SHALL NOT EXCEED THE TOTAL FEES ACTUALLY PAID BY CLIENT TO VEKTISS UNDER THIS CONTRACT IN THE THREE (3) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM. THIS LIMITATION APPLIES NOTWITHSTANDING THE FAILURE OF ANY ESSENTIAL PURPOSE OF ANY LIMITED REMEDY.

**16.3 Basis of the Bargain** — The Parties acknowledge that the limitations of liability and disclaimers of warranty in this Contract are an essential element of the bargain between them and that the fees would be substantially higher without such limitations.

**17.1 Indemnification by Client** — Client shall defend, indemnify, and hold harmless Vektiss, its members, officers, employees, contractors, and agents from and against any and all third‑party claims, demands, suits, proceedings, losses, damages, liabilities, fines, penalties, costs, and expenses (including reasonable attorneys' fees) arising out of or related to: (a) Client's use, misuse, or deployment of the Services or Deliverables; (b) any content, data, claim, offer, or material provided by Client; (c) Client's violation of any law or third‑party right; (d) Client's breach of this Contract; or (e) Client's communications with its customers, leads, or end users.

**18.1 Force Majeure** — Vektiss shall not be liable for any failure or delay in performance caused by circumstances beyond its reasonable control, including but not limited to acts of God, natural disasters, fire, flood, pandemic, epidemic, war, terrorism, civil unrest, governmental action, labor disputes, internet or telecommunications outages, hosting provider failures, third‑party platform outages or policy changes, AI model degradation or deprecation, cyberattacks, and shortages of equipment, supplies, or labor. The performance deadlines under this Contract shall be extended by a period equal to the duration of the force majeure event.`,
  },
  {
    title: "19–28. ADDITIONAL PROVISIONS",
    content: `**19. Confidentiality** — Each Party (the "Receiving Party") shall (a) hold all non‑public information disclosed by the other Party (the "Disclosing Party") — including business plans, financial information, customer data, pricing, technology, prompts, system designs, strategies, and any information marked or reasonably understood to be confidential ("Confidential Information") — in strict confidence; (b) use Confidential Information solely to perform its obligations or exercise its rights under this Contract; (c) protect such information using at least the same degree of care it uses for its own confidential information of like importance, and in no event less than a reasonable degree of care; and (d) limit access to Confidential Information to personnel and contractors who have a need to know and are bound by confidentiality obligations no less protective than those in this Section. Confidentiality obligations shall survive termination of this Contract for a period of three (3) years, and indefinitely with respect to trade secrets.

**20. Governing Law** — This Contract, and any dispute, claim, or controversy arising out of or relating to this Contract or its subject matter, shall be governed by and construed in accordance with the laws of the State of Texas, without regard to its conflict‑of‑law principles. The United Nations Convention on Contracts for the International Sale of Goods does not apply.

**21. Dispute Resolution; Binding Arbitration** — Any dispute, claim, or controversy arising out of or relating to this Contract that cannot be resolved through good‑faith negotiation within thirty (30) days shall be finally resolved by binding arbitration administered by the American Arbitration Association under its Commercial Arbitration Rules, conducted in Harris County, Texas, before a single arbitrator. Judgment on the award may be entered in any court of competent jurisdiction. THE PARTIES EXPRESSLY WAIVE ANY RIGHT TO A JURY TRIAL AND ANY RIGHT TO BRING OR PARTICIPATE IN A CLASS ACTION, COLLECTIVE ACTION, OR REPRESENTATIVE ACTION. Notwithstanding the foregoing, either Party may seek injunctive or other equitable relief in a court of competent jurisdiction located in Harris County, Texas, to protect intellectual property rights or Confidential Information. The prevailing Party in any such proceeding shall be entitled to recover its reasonable attorneys' fees and costs.

**22. Notices** — All notices, consents, and other communications under this Contract shall be in writing and shall be deemed given when: (a) delivered personally; (b) sent by email to the addresses set forth in Section 2 (with confirmation of receipt); or (c) sent by nationally recognized overnight courier with tracking. Either Party may update its notice address by giving written notice to the other Party.

**23. Portfolio Reference and Marketing** — Client grants Vektiss a non‑exclusive, royalty‑free, worldwide license to reference Client's business name, logo, and a general description of the work performed in Vektiss's portfolio, website, sales decks, case studies, social media posts, and other marketing materials. Client may revoke this permission at any time by sending written notice to info@vektiss.com.

**24. Severability** — If any provision of this Contract is held by a court or arbitrator of competent jurisdiction to be invalid, illegal, or unenforceable, such provision shall be modified to the minimum extent necessary to make it enforceable, or, if it cannot be so modified, severed from this Contract, and the remaining provisions shall continue in full force and effect.

**25. Entire Agreement** — This Contract, together with all Project Scopes, exhibits, and schedules incorporated by reference, constitutes the entire agreement between the Parties with respect to its subject matter and supersedes all prior or contemporaneous understandings, agreements, negotiations, representations, warranties, proposals, pitches, and communications, whether oral or written, between the Parties.

**26. Amendments** — No amendment, modification, or waiver of any provision of this Contract shall be effective unless in writing and signed by an authorized representative of each Party. Email confirmations from authorized representatives shall be deemed a valid writing for this purpose.

**27. Assignment** — Client may not assign, transfer, or delegate this Contract or any of its rights or obligations, whether by operation of law or otherwise, without Vektiss's prior written consent. Vektiss may assign this Contract without consent in connection with a merger, acquisition, reorganization, or sale of all or substantially all of its assets. Any attempted assignment in violation of this Section is null and void.

**28. Waiver; No Third‑Party Beneficiaries** — No waiver of any provision of this Contract shall be effective unless in writing and signed by the waiving Party. The failure of either Party to enforce any right or provision shall not be deemed a waiver of such right or provision or of any future right or provision. This Contract is for the sole benefit of the Parties and their permitted successors and assigns; no third party shall have any right to enforce any provision of this Contract.

**29. Electronic Signatures and Counterparts** — This Contract may be executed in counterparts, each of which shall be deemed an original and all of which together shall constitute one and the same instrument. The Parties agree that electronic signatures, signatures transmitted by email, signatures applied through electronic signing platforms, or signatures provided by clicking an "I Agree," "Sign," or similar acknowledgment button, shall have the same legal force and effect as original handwritten signatures and shall be deemed valid, binding, and admissible under the Electronic Signatures in Global and National Commerce Act (E‑SIGN Act) and the Uniform Electronic Transactions Act (UETA).`,
  },
];

export function renderContract(data: {
  clientName: string;
  companyName: string;
  clientAddress: string;
  clientEmail: string;
  clientNumber?: string;
  projectName?: string;
  projectNumber?: string;
  setupFee: number;
  monthlyFee: number;
  servicesDescription?: string;
  effectiveDate?: string;
  proposalType?: ProposalType;
  hourlyRate?: number;
  projectTotal?: number;
  scopeDescription?: string;
  deliverables?: string;
  timeline?: string;
}): { title: string; content: string }[] {
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

  const date = data.effectiveDate || new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const servicesBlock = data.servicesDescription
    ? `\n\n**Additional Services Description:**\n${data.servicesDescription}`
    : "";

  const proposalType: ProposalType = data.proposalType || "retainer";

  // Fee block changes per proposal type
  let feeBlock = "";
  if (proposalType === "hourly") {
    feeBlock = `**3A.2 Hourly Rate Engagement** — Client engages Vektiss on an hourly basis at a rate of **${fmt(data.hourlyRate || 0)} per hour**. Time will be tracked and invoiced as worked. Invoices are due upon receipt.

**3A.3 No Recurring Fee** — This engagement does not include a fixed monthly retainer or one‑time setup fee unless otherwise stated in writing. Either party may discontinue the engagement upon written notice; Client remains obligated for hours already worked.`;
  } else if (proposalType === "project") {
    feeBlock = `**3A.2 Fixed Project Fee** — Client shall pay a fixed project fee of **${fmt(data.projectTotal || 0)}** for the Services described in Section 5. Payment terms: 50% upon execution of this Contract and 50% upon delivery, unless otherwise agreed in writing.

**3A.3 No Ongoing Obligation** — Upon completion and final payment, neither party has any further financial obligation under this Contract beyond the surviving provisions.`;
  } else {
    // retainer (existing default behavior)
    feeBlock = `**3A.2 One‑Time Setup and Build Fee** — Client shall pay a one‑time setup fee of **${fmt(data.setupFee)}** covering initial planning, configuration, development, integration, and deployment.

**3A.3 Monthly Service Fee** — Monthly Service Fee Amount: **${fmt(data.monthlyFee)}** per month, which may include:
• Updates to AI prompts, responses, messaging, and logic
• Technical troubleshooting and issue resolution
• Monitoring system stability and performance
• Adjustments for compatibility with External Service Providers
• Updates to knowledge‑bases or training materials
• Routine support and guidance

**3A.4 Automatic Renewal** — The Monthly Service will automatically renew on a month‑to‑month basis unless Client provides at least thirty (30) days' written notice of cancellation.

**3A.5 Exclusions** — The Monthly Service Fee does not cover new projects, new automations, major redesigns, or expanded scope beyond the original Deliverables.`;
  }

  // Scope block — assembled from optional structured fields
  const scopeParts: string[] = [];
  if (data.scopeDescription?.trim()) {
    scopeParts.push(`**Scope of Work:**\n${data.scopeDescription.trim()}`);
  }
  if (data.deliverables?.trim()) {
    scopeParts.push(`**Deliverables:**\n${data.deliverables.trim()}`);
  }
  if (data.timeline?.trim()) {
    scopeParts.push(`**Timeline:**\n${data.timeline.trim()}`);
  }
  const scopeBlock = scopeParts.length ? scopeParts.join("\n\n") : "";

  return CONTRACT_SECTIONS.map((s) => ({
    title: s.title,
    content: s.content
      .replace(/\{\{CLIENT_NAME\}\}/g, data.clientName || "_______________")
      .replace(/\{\{COMPANY_NAME\}\}/g, data.companyName || "_______________")
      .replace(/\{\{CLIENT_ADDRESS\}\}/g, data.clientAddress || "_______________")
      .replace(/\{\{CLIENT_EMAIL\}\}/g, data.clientEmail || "_______________")
      .replace(/\{\{CLIENT_NUMBER\}\}/g, data.clientNumber || "—")
      .replace(/\{\{PROJECT_NAME\}\}/g, data.projectName || "—")
      .replace(/\{\{PROJECT_NUMBER\}\}/g, data.projectNumber || "—")
      .replace(/\{\{SETUP_FEE\}\}/g, fmt(data.setupFee))
      .replace(/\{\{MONTHLY_FEE\}\}/g, fmt(data.monthlyFee))
      .replace(/\{\{HOURLY_RATE\}\}/g, fmt(data.hourlyRate || 0))
      .replace(/\{\{PROJECT_TOTAL\}\}/g, fmt(data.projectTotal || 0))
      .replace(/\{\{FEE_BLOCK\}\}/g, feeBlock)
      .replace(/\{\{SCOPE_BLOCK\}\}/g, scopeBlock)
      .replace(/\{\{SERVICES_DESCRIPTION\}\}/g, servicesBlock)
      .replace(/\{\{EFFECTIVE_DATE\}\}/g, date),
  }));
}
