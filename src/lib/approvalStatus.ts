export type ClientApprovalResponse = "approved" | "rejected" | "suggestions";

export const CLIENT_APPROVAL_RESPONSES: ClientApprovalResponse[] = [
  "approved",
  "rejected",
  "suggestions",
];

const APPROVAL_STATUS_LABELS: Record<string, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Declined / changes requested",
  suggestions: "Suggestions sent",
};

export function approvalStatusLabel(status: string): string {
  return APPROVAL_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function isClientApprovalResponse(status: string): status is ClientApprovalResponse {
  return CLIENT_APPROVAL_RESPONSES.includes(status as ClientApprovalResponse);
}

export function approvalResponseNeedsNote(status: ClientApprovalResponse): boolean {
  return status === "rejected" || status === "suggestions";
}

export function approvalResponseActionLabel(status: ClientApprovalResponse): string {
  if (status === "approved") return "Approve video";
  if (status === "rejected") return "Decline / request changes";
  return "Send suggestions";
}
