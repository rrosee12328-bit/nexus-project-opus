import { createClient } from "npm:@supabase/supabase-js@2";

const DROPBOX_SHARED_LINK_FILE_URL = "https://content.dropboxapi.com/2/sharing/get_shared_link_file";
const DROPBOX_TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "private, no-store",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function mediaType(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  return ({ mp4: "video/mp4", m4v: "video/x-m4v", mov: "video/quicktime", webm: "video/webm", avi: "video/x-msvideo", mkv: "video/x-matroska", mpeg: "video/mpeg", mpg: "video/mpeg" } as Record<string, string>)[extension ?? ""] ?? "application/octet-stream";
}

type DropboxConnection = { id: string; access_token: string; refresh_token: string | null; access_token_expires_at: string | null };

async function renewDropboxAccessToken(
  supabase: ReturnType<typeof createClient>,
  connection: DropboxConnection,
) {
  const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
  const needsRenewal = !expiresAt || expiresAt - Date.now() < 2 * 60 * 1000;
  if (!needsRenewal) return connection.access_token;
  // A manually provisioned token has no refresh credential. It remains usable
  // until Dropbox expires or revokes it; OAuth connections renew automatically.
  if (!connection.refresh_token) return connection.access_token;

  const clientId = Deno.env.get("DROPBOX_CLIENT_ID");
  const clientSecret = Deno.env.get("DROPBOX_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Dropbox needs to be reconnected.");
  const response = await fetch(DROPBOX_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: connection.refresh_token }).toString(),
  });
  if (!response.ok) throw new Error("Dropbox needs to be reconnected.");
  const tokenData = await response.json() as { access_token?: string; expires_in?: number; refresh_token?: string };
  if (!tokenData.access_token) throw new Error("Dropbox needs to be reconnected.");
  const nextExpiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null;
  const { error } = await supabase.from("dropbox_video_review_connections").update({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || connection.refresh_token,
    access_token_expires_at: nextExpiresAt,
    updated_at: new Date().toISOString(),
  }).eq("id", connection.id);
  if (error) throw new Error("Dropbox needs to be reconnected.");
  return tokenData.access_token;
}

async function dropboxError(response: Response) {
  const fallback = response.status === 401 ? "Dropbox needs to be reconnected." : "Dropbox could not load this video.";
  try {
    const body = await response.json() as { error_summary?: string };
    const summary = body.error_summary ?? "";
    if (summary.includes("missing_scope") || summary.includes("insufficient_scope")) return "Dropbox needs the files.content.read permission before videos can play in Vektiss.";
    if (summary.includes("shared_link_not_found")) return "Dropbox could not find the source folder for this video.";
    if (summary.includes("shared_link_access_denied")) return "The connected Dropbox account cannot access this source folder.";
    if (summary.includes("path/not_found")) return "This video could not be found in the Dropbox folder.";
  } catch { /* Retain the generic, safe message. */ }
  return fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  try {
    const token = new URL(req.url).searchParams.get("token");
    if (!token) return json({ error: "A secure playback token is required." }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Video playback service is unavailable." }, 503);
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: playback, error: playbackError } = await serviceClient
      .from("dropbox_review_video_playback_tokens")
      .select("folder_url, file_path, file_name, expires_at")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (playbackError || !playback || !playback.folder_url || !playback.file_path || !playback.file_name) return json({ error: "This secure video link has expired. Refresh the review page and try again." }, 401);

    const { data: connection, error: connectionError } = await serviceClient
      .from("dropbox_video_review_connections")
      .select("id, access_token, refresh_token, access_token_expires_at")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (connectionError || !connection) return json({ error: "Dropbox is not connected for in-portal video playback." }, 409);
    const accessToken = await renewDropboxAccessToken(serviceClient, connection as DropboxConnection);

    const range = req.headers.get("range");
    const response = await fetch(DROPBOX_SHARED_LINK_FILE_URL, {
      method: "POST",
      redirect: "follow",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Dropbox-API-Arg": JSON.stringify({ url: playback.folder_url, path: playback.file_path }),
        ...(range ? { Range: range } : {}),
      },
    });
    if (!response.ok || !response.body) return json({ error: await dropboxError(response) }, response.status >= 400 ? response.status : 502);

    const headers = new Headers(corsHeaders);
    const upstreamContentType = response.headers.get("content-type");
    headers.set("Content-Type", !upstreamContentType || upstreamContentType === "application/octet-stream" ? mediaType(playback.file_name) : upstreamContentType);
    headers.set("Accept-Ranges", response.headers.get("accept-ranges") || "bytes");
    for (const header of ["content-length", "content-range"]) {
      const value = response.headers.get(header);
      if (value) headers.set(header, value);
    }
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not stream this review video." }, 500);
  }
});
