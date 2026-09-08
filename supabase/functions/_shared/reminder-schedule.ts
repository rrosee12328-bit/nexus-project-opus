export const CALL_REMINDER_OFFSETS = [
  { minutes: 1440, label: "24 hours" },
  { minutes: 120, label: "2 hours" },
  { minutes: 15, label: "15 minutes" },
] as const;

export function isCallReminderDue(minutesUntil: number, offsetMinutes: number, pollingWindowMinutes = 6): boolean {
  return minutesUntil <= offsetMinutes && minutesUntil > offsetMinutes - pollingWindowMinutes;
}

export function centralDailyWindow(now: Date): { date: string; active: boolean } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    active: part("hour") === "09" && Number(part("minute")) < 10,
  };
}
