import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MeetingTranscript } from "./MeetingTranscript";

afterEach(cleanup);

it("opens the stored transcript inside the portal", () => {
  render(<MeetingTranscript transcript="[00:01] Jeremy: Review the app." />);
  fireEvent.click(screen.getByRole("button", { name: "Read transcript" }));
  expect(screen.getByRole("region", { name: "Meeting transcript" })).toHaveTextContent("Jeremy: Review the app.");
});

it("explains when a recording has no synced transcript", () => {
  render(<MeetingTranscript transcript={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Read transcript" }));
  expect(screen.getByText(/The transcript has not synced yet/)).toBeInTheDocument();
});
