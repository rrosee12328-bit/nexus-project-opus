export function formatBillingStartDate(date: string | null | undefined): string | null {
  if (!date) return null;

  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function getLocalDateInputValue(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function isStripeBillingStartDateValid(
  date: string | null | undefined,
  now = new Date(),
): boolean {
  if (!date) return false;

  const today = getLocalDateInputValue(now);
  if (date === today) return true;
  if (date < today) return false;

  const chargeAt = new Date(`${date}T12:00:00Z`).getTime();
  return Number.isFinite(chargeAt) && chargeAt - now.getTime() >= 48 * 60 * 60 * 1000;
}
