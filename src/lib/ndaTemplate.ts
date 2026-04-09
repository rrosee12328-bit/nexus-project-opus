/**
 * Generic Mutual NDA template for Vektiss LLC.
 */

export const NDA_SECTIONS = [
  {
    title: "1. PURPOSE",
    content: `This Non-Disclosure Agreement ("NDA") is entered into between Vektiss LLC ("Vektiss") and the undersigned party ("Receiving Party") for the purpose of protecting confidential information disclosed during business discussions, evaluations, and the provision of services.`,
  },
  {
    title: "2. DEFINITION OF CONFIDENTIAL INFORMATION",
    content: `"Confidential Information" means all non-public information disclosed by either party, whether orally, in writing, or electronically, including but not limited to:
• Business plans, strategies, and financial information
• Technical data, product designs, and source code
• Client lists, pricing structures, and marketing plans
• Trade secrets, proprietary processes, and methodologies
• Any information marked or designated as confidential

Confidential Information does not include information that: (a) is or becomes publicly available through no fault of the Receiving Party; (b) was known to the Receiving Party prior to disclosure; (c) is independently developed without use of Confidential Information; or (d) is disclosed with the Disclosing Party's prior written consent.`,
  },
  {
    title: "3. OBLIGATIONS OF THE RECEIVING PARTY",
    content: `The Receiving Party agrees to:
• Hold all Confidential Information in strict confidence
• Not disclose Confidential Information to any third party without prior written consent
• Use Confidential Information solely for the purpose of evaluating or engaging in a business relationship
• Take reasonable measures to protect the confidentiality of all information received
• Limit access to Confidential Information to employees and agents who need to know and are bound by similar obligations`,
  },
  {
    title: "4. TERM",
    content: `This NDA shall remain in effect for a period of two (2) years from the date of execution. The obligations of confidentiality shall survive the expiration or termination of this Agreement for an additional period of two (2) years.`,
  },
  {
    title: "5. RETURN OF INFORMATION",
    content: `Upon written request or termination of this Agreement, the Receiving Party shall promptly return or destroy all Confidential Information and any copies thereof, and shall certify in writing that it has done so.`,
  },
  {
    title: "6. NO LICENSE",
    content: `Nothing in this Agreement grants the Receiving Party any license, interest, or rights in the Disclosing Party's Confidential Information, intellectual property, or other proprietary rights.`,
  },
  {
    title: "7. REMEDIES",
    content: `The parties acknowledge that a breach of this Agreement may cause irreparable harm for which monetary damages would be inadequate. In the event of a breach or threatened breach, the Disclosing Party shall be entitled to seek injunctive relief in addition to all other remedies available at law or in equity.`,
  },
  {
    title: "8. GOVERNING LAW",
    content: `This Agreement shall be governed by and construed in accordance with the laws of the State of Texas, without regard to its conflict of laws provisions. Any disputes arising under this Agreement shall be resolved in the courts of Harris County, Texas.`,
  },
  {
    title: "9. ENTIRE AGREEMENT",
    content: `This NDA constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior or contemporaneous agreements, understandings, or representations. This Agreement may not be amended except by a written instrument signed by both parties.`,
  },
  {
    title: "10. ELECTRONIC SIGNATURES",
    content: `Both parties agree that electronic signatures, whether digital or encrypted, shall be deemed valid and legally binding, with the same force and effect as original handwritten signatures.`,
  },
];

export function renderNda(data: {
  clientName: string;
  companyName: string;
  effectiveDate?: string;
}): { title: string; content: string }[] {
  const date = data.effectiveDate || new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  return NDA_SECTIONS.map((s) => ({
    title: s.title,
    content: s.content
      .replace(/\{\{CLIENT_NAME\}\}/g, data.clientName || "_______________")
      .replace(/\{\{COMPANY_NAME\}\}/g, data.companyName || "_______________")
      .replace(/\{\{EFFECTIVE_DATE\}\}/g, date),
  }));
}
