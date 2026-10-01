import { createClient } from "npm:@supabase/supabase-js@2";

const DROPBOX_LIST_FOLDER_URL = "https://api.dropboxapi.com/2/files/list_folder";
const DROPBOX_LIST_CONTINUE_URL = "https://api.dropboxapi.com/2/files/list_folder/continue";
const DROPBOX_TEMPORARY_LINK_URL = "https://api.dropboxapi.com/2/files/get_temporary_link";
const VIDEO_EXTENSION = /\.(mp4|mov|m4v|webm|avi|mkv|mpeg|mpg)$/i;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "private, no-store",
};

type ResolvePayload = { itemId?: string };
type DropboxFile = {
  ".tag": "file";
  name: string;
  path_lower?: string;
  path_display?: string;
};
type DropboxFolderResult = {
  entries: Array<DropboxFile | { ".tag": string; name?: string }>;
  cursor?: string;
  has_more?: boolean;
};

type ReviewItem = {
  id: string;
  title: string;
  review_url: string;
  source_file_name: string | null;
  approval_request_id: string;
};

type ReviewRequest = {
  id: string;
  client_id: string;
  review_url: string | null;
};

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
  } catch {
    return null;
  }
}

function filenameWithoutExtension(value: string) {
  return value.replace(VIDEO_EXTENSION, "").trim();
}

function comparableFilename(value: string) {
  return filenameWithoutExtension(value).toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function isStaff(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "ops"])
    .limit(1)
    .maybeSingle();
  return !error && Boolean(data);
}

async function dropboxError(response: Response) {
  const fallback = response.status === 401 ? "Dropbox needs to be reconnected." : "Dropbox could not load this video.";
  try {
    const body = await response.json() as { error_summary?: string };
    const summary = body.error_summary ?? "";
    if (summary.includes("missing_scope") || summary.includes("insufficient_scope")) {
      return "Dropbox needs the files.content.read permission before videos can play in Vektiss.";
    }
    if (summary.includes("shared_link_not_found")) return "Dropbox could not find the source folder for this video.";
    if (summary.includes("shared_link_access_denied")) return "The connected Dropbox account cannot access this source folder.";
    if (summary.includes("path/not_found")) return "This video could not be found in the Dropbox folder.";
  } catch {
    // Retain the generic, safe message.
  }
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
      body: JSON.stringify(page?.cursor
        ? { cursor: page.cursor }
        : { path: "", recursive: false, include_deleted: false, limit: 2000, shared_link: { url: folderUrl } }),
    });
    if (!response.ok) throw new Error(await dropboxError(response));
    page = await response.json() as DropboxFolderResult;
    files.push(...page.entries.filter((entry): entry is DropboxFile => entry[".tag"] === "file" && Boolean(entry.name) && VIDEO_EXTENSION.test(entry.name)));
    pagesRead += 1;
  } while (page.has_more && page.cursor && pagesRead < 5);

  return files.find((file) => file.name.toLocaleLowerCase() === wantedName)
    ?? files.find((file) => comparableFilename(file.name) === wantedTitle)
    ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Video playback service is unavailable." }, 503);

    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const payload = (await req.json().catch(() => ({}))) as ResolvePayload;
    const itemId = payload.itemId?.trim();
    if (!itemId) return json({ error: "Choose a video to play." }, 400);

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const [{ data: client }, staff] = await Promise.all([
      serviceClient.from("clients").select("id").eq("user_id", user.id).maybeSingle(),
      isStaff(serviceClient, user.id),
    ]);

    const { data: item, error: itemError } = await serviceClient
      .from("approval_request_items")
      .select("id, title, review_url, source_file_name, approval_request_id")
      .eq("id", itemId)
      .maybeSingle();
    if (itemError || !item) return json({ error: "That review video is unavailable." }, 404);

    const { data: request, error: requestError } = await serviceClient
      .from("approval_requests")
      .select("id, client_id, review_url")
      .eq("id", item.approval_request_id)
      .maybeSingle();
    if (requestError || !request) return json({ error: "That review delivery is unavailable." }, 404);
    if (!staff && (!client || request.client_id !== client.id)) return json({ error: "You are not allowed to view this video." }, 403);

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
    const folderUrl = normalizedDropboxLink(reviewRequest.review_url ?? reviewItem.review_url);
    if (!folderUrl) return json({ error: "This review does not have a valid Dropbox folder." }, 422);

    const file = await findFolderFile(
      connection.access_token,
      folderUrl,
      reviewItem.source_file_name ?? reviewItem.title,
      reviewItem.title,
    );
    if (!file) return json({ error: "This video could not be matched to a file in the Dropbox folder." }, 404);

    const path = file.path_lower ?? file.path_display;
    if (!path) return json({ error: "Dropbox did not provide a playable path for this video." }, 422);
    const linkResponse = await fetch(DROPBOX_TEMPORARY_LINK_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${connection.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!linkResponse.ok) return json({ error: await dropboxError(linkResponse) }, 422);

    const link = await linkResponse.json() as { link?: string };
    if (!link.link) return json({ error: "Dropbox did not provide a playable video link." }, 422);
    return json({
      url: link.link,
      file_name: file.name,
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not prepare this video for playback." }, 500);
  }
});
