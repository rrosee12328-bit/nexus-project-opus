export const PRODUCTION_APP_URL = "https://portal.vektiss.com";

export function getAppUrl(path = "") {
  const baseUrl = import.meta.env.DEV ? window.location.origin : PRODUCTION_APP_URL;
  return new URL(path || "/", `${baseUrl}/`).toString();
}
