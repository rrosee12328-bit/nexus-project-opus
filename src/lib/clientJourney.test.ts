import { describe, expect, it } from "vitest";
import { clientJourney, clientWorkspaceLink, type JourneyProposal } from "./clientJourney";

const proposal: JourneyProposal = {
  status: "sent", signed_at: null, nda_signed_at: null, paid_at: null,
  project_deposit_paid_at: null, setup_fee: 1500, setup_paid: 0,
  billing_start_date: "2026-10-11",
};
const milestone = (p: JourneyProposal | null, label: string) =>
  clientJourney(p, null, null).find(item => item.label === label)!;

describe("verified client journey", () => {
  it("does not invent completion for a missing proposal", () => {
    expect(clientJourney(null, null, null).every(item => !item.complete)).toBe(true);
  });
  it("keeps contract and NDA signatures separate", () => {
    const signed = { ...proposal, signed_at: "2026-09-25T12:00:00Z" };
    expect(milestone(signed, "Contract").complete).toBe(true);
    expect(milestone(signed, "NDA").complete).toBe(false);
    expect(milestone(signed, "Payment").complete).toBe(false);
  });
  it("preserves an already paid setup fee without requiring another checkout", () => {
    expect(milestone({ ...proposal, setup_paid: 1500 }, "Payment")).toMatchObject({ complete: true, detail: "Setup paid" });
  });
  it("does not treat a zero fee or scheduled date as proof of payment", () => {
    expect(milestone({ ...proposal, setup_fee: 0 }, "Payment").complete).toBe(false);
    expect(milestone(proposal, "Payment").complete).toBe(false);
  });
  it("recognizes a verified deposit without claiming the full setup is paid", () => {
    expect(milestone({ ...proposal, setup_paid: 750, project_deposit_paid_at: "2026-09-25" }, "Payment"))
      .toMatchObject({ complete: true, detail: "Deposit received" });
  });
  it("does not confuse a linked account with completed onboarding", () => {
    const journey = clientJourney(proposal, "user-id", null);
    expect(journey.find(item => item.label === "Account")?.complete).toBe(true);
    expect(journey.find(item => item.label === "Onboarding")?.complete).toBe(false);
  });
  it("retains the selected client and destination in workspace links", () => {
    expect(clientWorkspaceLink("client-id", "billing")).toBe("/admin/clients/client-id?tab=billing");
  });
  it("recognizes client-level setup credit without creating a replacement proposal", () => {
    const journey = clientJourney(null, null, null, { setup_fee: 1500, setup_paid: 1500 });
    expect(journey.find(item => item.label === "Payment")).toMatchObject({ complete: true, detail: "Setup paid" });
    expect(journey.find(item => item.label === "Proposal")?.complete).toBe(false);
  });
});
