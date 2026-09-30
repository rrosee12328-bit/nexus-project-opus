import { describe, expect, it } from "vitest";
import {
  approvalResponseActionLabel,
  approvalResponseNeedsNote,
  approvalStatusLabel,
  isClientApprovalResponse,
} from "./approvalStatus";

describe("approval status helpers", () => {
  it("identifies the three client response outcomes", () => {
    expect(isClientApprovalResponse("approved")).toBe(true);
    expect(isClientApprovalResponse("rejected")).toBe(true);
    expect(isClientApprovalResponse("suggestions")).toBe(true);
    expect(isClientApprovalResponse("pending")).toBe(false);
  });

  it("requires context for declines and suggestions", () => {
    expect(approvalResponseNeedsNote("approved")).toBe(false);
    expect(approvalResponseNeedsNote("rejected")).toBe(true);
    expect(approvalResponseNeedsNote("suggestions")).toBe(true);
  });

  it("uses client-facing labels", () => {
    expect(approvalStatusLabel("suggestions")).toBe("Suggestions sent");
    expect(approvalResponseActionLabel("rejected")).toBe("Decline / request changes");
  });
});
