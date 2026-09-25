import { describe, expect, it } from "vitest";
import { meetingTime } from "./meetingTime";

describe("meeting time display", () => {
  it("preserves the event timezone rather than using the viewer timezone", () => {
    expect(meetingTime("2026-09-25T16:00:00Z", "America/New_York")).toContain("12:00 PM EDT");
    expect(meetingTime("2026-09-25T16:00:00Z", "America/Chicago")).toContain("11:00 AM CDT");
  });
  it("handles missing times and invalid provider timezones safely", () => {
    expect(meetingTime(null)).toBe("Time not confirmed");
    expect(meetingTime("not a date")).toBe("Time not confirmed");
    expect(meetingTime("2026-09-25T16:00:00Z", "invalid")).toContain("UTC");
  });
});
