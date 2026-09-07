import { describe, expect, it } from "vitest";
import { formatBillingStartDate, getLocalDateInputValue, isStripeBillingStartDateValid } from "./billingDates";

describe("formatBillingStartDate", () => {
  it("formats date-only values without shifting time zones", () => {
    expect(formatBillingStartDate("2026-09-11")).toBe("September 11, 2026");
  });

  it("returns null for missing or invalid values", () => {
    expect(formatBillingStartDate(null)).toBeNull();
    expect(formatBillingStartDate("not-a-date")).toBeNull();
  });

  it("allows today or a future Stripe date at least 48 hours away", () => {
    const now = new Date("2026-09-07T21:00:00Z");
    expect(getLocalDateInputValue(new Date(2026, 8, 7))).toBe("2026-09-07");
    expect(isStripeBillingStartDateValid("2026-09-07", now)).toBe(true);
    expect(isStripeBillingStartDateValid("2026-09-08", now)).toBe(false);
    expect(isStripeBillingStartDateValid("2026-09-11", now)).toBe(true);
  });
});
