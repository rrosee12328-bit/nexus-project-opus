import { createClient } from "npm:@supabase/supabase-js@2";

const DROPBOX_SHARED_LINK_FILE_URL = "https://content.dropboxapi.com/2/sharing/get_shared_link_file";
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
      .select("access_token")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (connectionError || !connection) return json({ error: "Dropbox is not connected for in-portal video playback." }, 409);

    const range = req.headers.get("range");
    const response = await fetch(DROPBOX_SHARED_LINK_FILE_URL, {
      method: "POST",
      redirect: "follow",
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
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
