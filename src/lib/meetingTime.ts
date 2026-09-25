export function meetingTime(start: string | null, timeZone = "America/Chicago") {
  if (!start || !Number.isFinite(Date.parse(start))) return "Time not confirmed";
  const options: Intl.DateTimeFormatOptions = {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  };
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(new Date(start));
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(start));
  }
}
