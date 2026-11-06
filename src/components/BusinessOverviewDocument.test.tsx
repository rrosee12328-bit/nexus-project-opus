import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BusinessOverviewDocument } from "./BusinessOverviewDocument";

afterEach(cleanup);
const overview = { company_name: "Example Company", title: "Your opportunity", expires_at: "2027-01-01", content: "## Customer communication\nA better response." };
describe("company overview", () => {
  it("shows a no-payment overview with a questionnaire link", () => {
    render(<BusinessOverviewDocument overview={overview} />);
    expect(screen.getByText("Example Company")).toBeTruthy();
    expect(screen.getByText(/Not a contract, invoice/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Complete discovery questions/ }).getAttribute("href")).toBe("#discovery-questionnaire");
    expect(screen.getAllByRole("textbox")).toHaveLength(18);
  });
  it("does not provide an actionable scheduling button in staff preview", () => {
    render(<BusinessOverviewDocument overview={overview} preview />);
    expect(screen.queryByRole("link", { name: "Schedule a discovery call" })).toBeNull();
  });
  it("does not render raw HTML, tracking images or executable links", () => {
    const { container } = render(<BusinessOverviewDocument overview={{ ...overview, content: '<iframe src="https://example.com"></iframe>\n\n![tracking](https://example.com/pixel)\n\n[bad](javascript:alert%281%29)' }} />);
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector('img[src="https://example.com/pixel"]')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });
});
