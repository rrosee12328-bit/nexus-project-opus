import { createClient } from "npm:@supabase/supabase-js@2";

const DROPBOX_LIST_FOLDER_URL = "https://api.dropboxapi.com/2/files/list_folder";
const DROPBOX_LIST_CONTINUE_URL = "https://api.dropboxapi.com/2/files/list_folder/continue";
const DROPBOX_TEMPORARY_LINK_URL = "https://api.dropboxapi.com/2/files/get_temporary_link";
const DROPBOX_SHARED_LINK_METADATA_URL = "https://api.dropboxapi.com/2/sharing/get_shared_link_metadata";
const VIDEO_EXTENSION = /\.(mp4|mov|m4v|webm|avi|mkv|mpeg|mpg)$/i;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "private, no-store",
};

type ResolvePayload = { itemId?: string };
type DropboxFile = { ".tag": "file"; id?: string; name: string; path_lower?: string; path_display?: string };
type DropboxFolderResult = { entries: Array<DropboxFile | { ".tag": string; name?: string }>; cursor?: string; has_more?: boolean };
type ReviewItem = { id: string; title: string; source_file_name: string | null; approval_request_id: string };
type ReviewRequest = { id: string; client_id: string; review_url: string | null };

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

function comparableFilename(value: string) {
  return value.replace(VIDEO_EXTENSION, "").trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function dropboxError(response: Response) {
  const fallback = response.status === 401 ? "Dropbox needs to be reconnected." : "Dropbox could not load this video.";
  try {
    const body = await response.json() as { error_summary?: string };
    const summary = body.error_summary ?? "";
    if (summary.includes("missing_scope") || summary.includes("insufficient_scope")) return "Dropbox needs the files.content.read permission before videos can play in Vektiss.";
    if (summary.includes("shared_link_not_found")) return "Dropbox could not find the source folder for this video.";
    if (summary.includes("shared_link_access_denied")) return "The connected Dropbox account cannot access this source folder.";
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

async function isStaff(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "ops"]).limit(1).maybeSingle();
  return !error && Boolean(data);
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
    const { data: item, error: itemError } = await serviceClient.from("approval_request_items").select("id, title, source_file_name, approval_request_id").eq("id", itemId).maybeSingle();
    if (itemError || !item) return json({ error: "That review video is unavailable." }, 404);
    const { data: request, error: requestError } = await serviceClient.from("approval_requests").select("id, client_id, review_url").eq("id", item.approval_request_id).maybeSingle();
    if (requestError || !request) return json({ error: "That review delivery is unavailable." }, 404);
    if (!staff && (!client || request.client_id !== client.id)) return json({ error: "You are not allowed to view this video." }, 403);
    const { data: connection, error: connectionError } = await serviceClient.from("dropbox_video_review_connections").select("access_token").eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (connectionError || !connection) return json({ error: "Dropbox is not connected for in-portal video playback." }, 409);

    const reviewItem = item as ReviewItem;
    const reviewRequest = request as ReviewRequest;
    const folderUrl = normalizedDropboxLink(reviewRequest.review_url ?? "");
    if (!folderUrl) return json({ error: "This review does not have a valid Dropbox folder." }, 422);
    const file = await findFolderFile(connection.access_token, folderUrl, reviewItem.source_file_name ?? reviewItem.title, reviewItem.title);
    if (!file) return json({ error: "This video could not be matched to a file in the Dropbox folder." }, 404);
    const filePath = file.path_lower || file.path_display || `/${file.name}`;

    // A Full Dropbox connection can mint a short-lived CDN URL. This keeps the
    // branded Vektiss player while avoiding a server relay for every byte range.
    const directLinkResponse = await fetch(DROPBOX_TEMPORARY_LINK_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${connection.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ path: file.id || filePath }),
    });
    if (directLinkResponse.ok) {
      const directLink = await directLinkResponse.json() as { link?: string };
      if (directLink.link) {
        return json({
          url: directLink.link,
          file_name: file.name,
          expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        });
      }
    } else {
      const directLinkError = await directLinkResponse.json().catch(() => ({})) as { error_summary?: string };
      // A shared folder can be a separate Dropbox namespace even for its owner.
      // Retry against that namespace before falling back to the private relay.
      if (directLinkError.error_summary?.startsWith("path/not_found")) {
        const metadataResponse = await fetch(DROPBOX_SHARED_LINK_METADATA_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${connection.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: folderUrl }),
        });
        if (metadataResponse.ok) {
          const metadata = await metadataResponse.json() as { id?: string };
          if (metadata.id) {
            const namespaceLinkResponse = await fetch(DROPBOX_TEMPORARY_LINK_URL, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${connection.access_token}`,
                "Content-Type": "application/json",
                "Dropbox-API-Path-Root": JSON.stringify({ ".tag": "namespace_id", namespace_id: metadata.id }),
              },
              body: JSON.stringify({ path: filePath }),
            });
            if (namespaceLinkResponse.ok) {
              const namespaceLink = await namespaceLinkResponse.json() as { link?: string };
              if (namespaceLink.link) {
                return json({
                  url: namespaceLink.link,
                  file_name: file.name,
                  expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
                });
              }
            } else {
              const namespaceError = await namespaceLinkResponse.json().catch(() => ({})) as { error_summary?: string };
              console.info("Dropbox shared-folder namespace CDN playback unavailable", { status: namespaceLinkResponse.status, error_summary: namespaceError.error_summary ?? "unavailable", file_name: file.name });
            }
          }
        }
      }
      console.info("Dropbox CDN playback unavailable; using secure shared-link stream", {
        status: directLinkResponse.status,
        error_summary: directLinkError.error_summary ?? "unavailable",
        file_name: file.name,
      });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await serviceClient.from("dropbox_review_video_playback_tokens").delete().lt("expires_at", new Date().toISOString());
    const { error: tokenError } = await serviceClient.from("dropbox_review_video_playback_tokens").insert({ token, item_id: reviewItem.id, user_id: user.id, folder_url: folderUrl, file_path: filePath, file_name: file.name, expires_at: expiresAt });
    if (tokenError) return json({ error: "Could not prepare secure video playback." }, 503);
    return json({ url: `${supabaseUrl}/functions/v1/stream-dropbox-review-video?token=${encodeURIComponent(token)}`, file_name: file.name, expires_at: expiresAt });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not prepare this video for playback." }, 500);
  }
});
