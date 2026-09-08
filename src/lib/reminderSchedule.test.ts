import { describe, expect, it } from "vitest";
import { centralDailyWindow, isCallReminderDue } from "../../supabase/functions/_shared/reminder-schedule";

describe("client reminder scheduling", () => {
  it("opens the daily window at 9 AM Central across daylight saving time", () => {
    expect(centralDailyWindow(new Date("2026-07-01T14:05:00Z"))).toEqual({ date: "2026-07-01", active: true });
    expect(centralDailyWindow(new Date("2026-12-01T15:05:00Z"))).toEqual({ date: "2026-12-01", active: true });
    expect(centralDailyWindow(new Date("2026-12-01T15:12:00Z")).active).toBe(false);
  });

  it("fires once inside each five-minute polling interval", () => {
    expect(isCallReminderDue(15, 15)).toBe(true);
    expect(isCallReminderDue(10, 15)).toBe(true);
    expect(isCallReminderDue(9, 15)).toBe(false);
    expect(isCallReminderDue(121, 120)).toBe(false);
    expect(isCallReminderDue(119, 120)).toBe(true);
  });
});
