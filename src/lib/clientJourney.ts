export interface JourneyProposal {
  status: string;
  signed_at: string | null;
  nda_signed_at: string | null;
  paid_at: string | null;
  project_deposit_paid_at: string | null;
  setup_fee: number;
  setup_paid: number;
  billing_start_date: string | null;
}

export function clientJourney(proposal: JourneyProposal | null, userId: string | null, completedAt: string | null, clientCredit?: { setup_fee: number | null; setup_paid: number | null }) {
  const fee = Math.max(Number(clientCredit?.setup_fee ?? 0), Number(proposal?.setup_fee ?? 0));
  const paid = Math.max(Number(clientCredit?.setup_paid ?? 0), Number(proposal?.setup_paid ?? 0));
  const setupPaid = fee > 0 && paid >= fee;
  return [
    { label: "Proposal", complete: !!proposal && ["sent", "signed", "paid"].includes(proposal.status), detail: proposal ? proposal.status : "Not created" },
    { label: "Contract", complete: !!proposal?.signed_at, detail: proposal?.signed_at || "Awaiting signature" },
    { label: "NDA", complete: !!proposal?.nda_signed_at, detail: proposal?.nda_signed_at || "Awaiting signature" },
    { label: "Payment", complete: !!(proposal?.paid_at || proposal?.project_deposit_paid_at) || setupPaid, detail: setupPaid ? "Setup paid" : proposal?.project_deposit_paid_at ? "Deposit received" : proposal?.paid_at ? "Checkout completed" : "Awaiting confirmation" },
    { label: "Account", complete: !!userId, detail: userId ? "Portal account linked" : "Not linked" },
    { label: "Onboarding", complete: !!completedAt, detail: completedAt || "Not completed" },
  ];
}

export const clientWorkspaceLink = (clientId: string, tab = "overview") =>
  `/admin/clients/${encodeURIComponent(clientId)}?tab=${encodeURIComponent(tab)}`;
