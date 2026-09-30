export function normalizeReviewUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isDropboxHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "dropbox.com" || host.endsWith(".dropbox.com") || host === "dropboxusercontent.com" || host.endsWith(".dropboxusercontent.com");
}

/**
 * Keeps the client experience inside Dropbox's viewer rather than sending a
 * direct-download link. Shared links from both Dropbox URL families are valid.
 */
export function normalizeDropboxReviewUrl(value: string): string | null {
  const secureUrl = normalizeReviewUrl(value);
  if (!secureUrl) return null;

  const url = new URL(secureUrl);
  if (!isDropboxHost(url.hostname) || !url.pathname || url.pathname === "/") return null;

  url.searchParams.delete("raw");
  url.searchParams.set("dl", "0");
  return url.toString();
}
