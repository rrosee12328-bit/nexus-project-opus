import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WebsiteQuestionnaire } from "./WebsiteQuestionnaire";
import { WEBSITE_QUESTIONS } from "@/lib/websiteQuestionnaire";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("preserves all 44 numbered questions and six sections", () => {
  expect(WEBSITE_QUESTIONS).toHaveLength(6);
  expect(WEBSITE_QUESTIONS.flatMap(s => s.questions)).toHaveLength(44);
  render(<WebsiteQuestionnaire token="test" recipientName="Integrated Infusions" onDone={() => {}} />);
  expect(screen.getAllByRole("textbox")).toHaveLength(45);
});
it("submits optional answers through the intake RPC without email", async () => {
  rpc.mockResolvedValue({ error: null });
  const done = vi.fn();
  render(<WebsiteQuestionnaire token="test" recipientName="Integrated Infusions" onDone={done} />);
  fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Integrated Infusions" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit questionnaire" }));
  await vi.waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(rpc.mock.calls[0][0]).toBe("submit_intake_response");
  expect(rpc.mock.calls[0][1]._response.response_payload.sections).toHaveLength(7);
});
