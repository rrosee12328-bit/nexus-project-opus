import { createClient } from "npm:@supabase/supabase-js@2";

const DROPBOX_LIST_FOLDER_URL = "https://api.dropboxapi.com/2/files/list_folder";
const DROPBOX_LIST_CONTINUE_URL = "https://api.dropboxapi.com/2/files/list_folder/continue";
const DROPBOX_SHARED_LINK_FILE_URL = "https://content.dropboxapi.com/2/sharing/get_shared_link_file";
const VIDEO_EXTENSION = /\.(mp4|mov|m4v|webm|avi|mkv|mpeg|mpg)$/i;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "private, no-store",
};

type DropboxFile = { ".tag": "file"; name: string; path_lower?: string; path_display?: string };
type DropboxFolderResult = { entries: Array<DropboxFile | { ".tag": string; name?: string }>; cursor?: string; has_more?: boolean };
type ReviewItem = { id: string; title: string; review_url: string | null; source_file_name: string | null; approval_request_id: string };
type ReviewRequest = { id: string; review_url: string | null };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function normalizedDropboxLink(value: string) {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    const isDropbox = host === "dropbox.com" || host.endsWith(".dropbox.com") || host === "dropboxusercontent.com" || host.endsWith(".dropboxusercontent.com");
    if (url.protocol !== "https:" || !isDropbox || !url.pathname || url.pathname === "/") return null;
    url.searchParams.set("dl", "0");
    return url.toString();
  } catch { return null; }
}

function filenameWithoutExtension(value: string) { return value.replace(VIDEO_EXTENSION, "").trim(); }
function comparableFilename(value: string) { return filenameWithoutExtension(value).toLocaleLowerCase().replace(/[^a-z0-9]+/g, ""); }
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

async function findFolderFile(accessToken: string, folderUrl: string, sourceFileName: string, title: string) {
  const wantedName = sourceFileName.trim().toLocaleLowerCase();
  const wantedTitle = comparableFilename(title);
  const files: DropboxFile[] = [];
  let page: DropboxFolderResult | null = null;
  let pagesRead = 0;
  do {
    const response = await fetch(page?.cursor ? DROPBOX_LIST_CONTINUE_URL : DROPBOX_LIST_FOLDER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(page?.cursor ? { cursor: page.cursor } : { path: "", recursive: false, include_deleted: false, limit: 2000, shared_link: { url: folderUrl } }),
    });
    if (!response.ok) throw new Error(await dropboxError(response));
    page = await response.json() as DropboxFolderResult;
    files.push(...page.entries.filter((entry): entry is DropboxFile => entry[".tag"] === "file" && Boolean(entry.name) && VIDEO_EXTENSION.test(entry.name)));
    pagesRead += 1;
  } while (page.has_more && page.cursor && pagesRead < 5);
  return files.find((file) => file.name.toLocaleLowerCase() === wantedName) ?? files.find((file) => comparableFilename(file.name) === wantedTitle) ?? null;
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
      .select("item_id, expires_at")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (playbackError || !playback) return json({ error: "This secure video link has expired. Refresh the review page and try again." }, 401);

    const { data: item, error: itemError } = await serviceClient
      .from("approval_request_items")
      .select("id, title, review_url, source_file_name, approval_request_id")
      .eq("id", playback.item_id)
      .maybeSingle();
    if (itemError || !item) return json({ error: "That review video is unavailable." }, 404);
    const { data: request, error: requestError } = await serviceClient
      .from("approval_requests")
      .select("id, review_url")
      .eq("id", item.approval_request_id)
      .maybeSingle();
    if (requestError || !request) return json({ error: "That review delivery is unavailable." }, 404);
    const { data: connection, error: connectionError } = await serviceClient
      .from("dropbox_video_review_connections")
      .select("access_token")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (connectionError || !connection) return json({ error: "Dropbox is not connected for in-portal video playback." }, 409);

    const reviewItem = item as ReviewItem;
    const reviewRequest = request as ReviewRequest;
    const folderUrl = normalizedDropboxLink(reviewRequest.review_url ?? reviewItem.review_url ?? "");
    if (!folderUrl) return json({ error: "This review does not have a valid Dropbox folder." }, 422);
    const file = await findFolderFile(connection.access_token, folderUrl, reviewItem.source_file_name ?? reviewItem.title, reviewItem.title);
    if (!file) return json({ error: "This video could not be matched to a file in the Dropbox folder." }, 404);

    const filePath = file.path_lower || file.path_display || `/${file.name}`;
    const range = req.headers.get("range");
    const response = await fetch(DROPBOX_SHARED_LINK_FILE_URL, {
      method: "POST",
      redirect: "follow",
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
        "Dropbox-API-Arg": JSON.stringify({ url: folderUrl, path: filePath }),
        ...(range ? { Range: range } : {}),
      },
    });
    if (!response.ok || !response.body) return json({ error: await dropboxError(response) }, response.status >= 400 ? response.status : 502);

    const headers = new Headers(corsHeaders);
    const upstreamContentType = response.headers.get("content-type");
    headers.set("Content-Type", !upstreamContentType || upstreamContentType === "application/octet-stream" ? mediaType(file.name) : upstreamContentType);
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
