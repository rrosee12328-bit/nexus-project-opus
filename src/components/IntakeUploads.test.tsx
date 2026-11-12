import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StaffIntakeUploads } from "./IntakeUploads";

vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [
  { id: "1", file_name: "logo.png", category: "logo" },
  { id: "2", file_name: "brief.pdf", category: "materials" },
] }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

describe("question-scoped intake uploads", () => {
  it("only displays files from the matching upload prompt", () => {
    render(<StaffIntakeUploads formId="test" category="logo" />);
    expect(screen.getByText("logo.png")).toBeTruthy();
    expect(screen.queryByText("brief.pdf")).toBeNull();
    expect(screen.getByRole("button", { name: "Download" })).toBeTruthy();
  });
  it("explicitly identifies an empty upload prompt", () => {
    render(<StaffIntakeUploads formId="test" category="photos" />);
    expect(screen.getByText("No files uploaded here.")).toBeTruthy();
  });
});
