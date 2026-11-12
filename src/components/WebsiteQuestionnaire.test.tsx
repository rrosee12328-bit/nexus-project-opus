import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WebsiteQuestionnaire } from "./WebsiteQuestionnaire";
import { WEBSITE_QUESTIONS } from "@/lib/websiteQuestionnaire";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, functions: { invoke: vi.fn().mockResolvedValue({data:{files:[]}}) } } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("shows website-only questions and direct upload controls", () => {
  expect(WEBSITE_QUESTIONS).toHaveLength(5);
  expect(WEBSITE_QUESTIONS.flatMap(s => s.questions)).toHaveLength(35);
  render(<WebsiteQuestionnaire token="test" recipientName="Integrated Infusions" onDone={() => {}} />);
  expect(screen.getAllByRole("textbox")).toHaveLength(36);
  expect(screen.getByLabelText("Upload company logo")).toHaveAttribute("type", "file");
  expect(screen.getByLabelText("Upload company / team photos")).toHaveAttribute("type", "file");
  expect(screen.getByLabelText("Upload website materials")).toHaveAttribute("type", "file");
  expect(screen.queryByText(/nurse recruitment/i)).not.toBeInTheDocument();
});
it("submits optional answers through the intake RPC without email", async () => {
  rpc.mockResolvedValue({ error: null });
  const done = vi.fn();
  render(<WebsiteQuestionnaire token="test" recipientName="Integrated Infusions" onDone={done} />);
  fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Integrated Infusions" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit questionnaire" }));
  await vi.waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(rpc.mock.calls[0][0]).toBe("submit_intake_response");
  expect(rpc.mock.calls[0][1]._response.response_payload.sections).toHaveLength(6);
});
