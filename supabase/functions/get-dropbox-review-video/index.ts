import { createClient } from "npm:@supabase/supabase-js@2";

const DROPBOX_LIST_FOLDER_URL = "https://api.dropboxapi.com/2/files/list_folder";
const DROPBOX_LIST_CONTINUE_URL = "https://api.dropboxapi.com/2/files/list_folder/continue";
const DROPBOX_TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const DROPBOX_METADATA_URL = "https://api.dropboxapi.com/2/sharing/get_shared_link_metadata";
const REVIEWABLE_ASSET_EXTENSION = /\.(mp4|mov|m4v|webm|avi|mkv|mpeg|mpg|jpg|jpeg|png|webp|gif|avif)$/i;
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "private, no-store" };

type ResolvePayload = { itemId?: string; publicToken?: string };
type DropboxFile = { ".tag": "file"; name: string; path_lower?: string; path_display?: string };
type DropboxFolderResult = { entries: Array<DropboxFile | { ".tag": string; name?: string }>; cursor?: string; has_more?: boolean };
type ReviewItem = { id: string; title: string; source_file_name: string | null; review_url: string | null; approval_request_id: string };
type ReviewRequest = { id: string; client_id: string; review_url: string | null };
type ServiceClient = ReturnType<typeof createClient<any>>;
type DropboxConnection = { id: string; access_token: string; refresh_token: string | null; access_token_expires_at: string | null };
type DropboxSharedLinkMetadata = { ".tag"?: string; name?: string };
type ReviewShareLink = { id: string; approval_request_id: string };

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function normalizedDropboxLink(value: string) { try { const url = new URL(value.trim()); const host = url.hostname.toLowerCase(); const isDropbox = host === "dropbox.com" || host.endsWith(".dropbox.com") || host === "dropboxusercontent.com" || host.endsWith(".dropboxusercontent.com"); if (url.protocol !== "https:" || !isDropbox || !url.pathname || url.pathname === "/") return null; url.searchParams.set("dl", "0"); return url.toString(); } catch { return null; } }
function comparableFilename(value: string) { return value.replace(REVIEWABLE_ASSET_EXTENSION, "").trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, ""); }

async function tokenHash(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function resolveShareLink(supabase: ServiceClient, token: string): Promise<ReviewShareLink | null> {
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  const { data, error } = await supabase
    .from("approval_review_share_links")
    .select("id, approval_request_id")
    .eq("token_hash", await tokenHash(token))
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return error || !data ? null : data as ReviewShareLink;
}

async function dropboxError(response: Response) {
  const fallback = response.status === 401 ? "Dropbox needs to be reconnected." : "Dropbox could not load this review item.";
  try {
    const body = await response.json() as { error_summary?: string };
    const summary = body.error_summary ?? "";
    if (summary.includes("missing_scope") || summary.includes("insufficient_scope")) return "Dropbox needs the files.content.read permission before creative items can play in Vektiss.";
    if (summary.includes("shared_link_not_found")) return "Dropbox could not find the source folder for this review item.";
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
    const response = await fetch(page?.cursor ? DROPBOX_LIST_CONTINUE_URL : DROPBOX_LIST_FOLDER_URL, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(page?.cursor ? { cursor: page.cursor } : { path: "", recursive: false, include_deleted: false, limit: 2000, shared_link: { url: folderUrl } }) });
    if (!response.ok) throw new Error(await dropboxError(response));
    page = await response.json() as DropboxFolderResult;
    files.push(...page.entries.filter((entry): entry is DropboxFile => entry[".tag"] === "file" && typeof entry.name === "string" && REVIEWABLE_ASSET_EXTENSION.test(entry.name)));
    pagesRead += 1;
  } while (page.has_more && page.cursor && pagesRead < 5);
  return files.find((file) => file.name.toLocaleLowerCase() === wantedName) ?? files.find((file) => comparableFilename(file.name) === wantedTitle) ?? null;
}

async function isStaff(supabase: ServiceClient, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "ops"]).limit(1).maybeSingle();
  return !error && Boolean(data);
}

async function renewDropboxAccessToken(supabase: ServiceClient, connection: DropboxConnection) {
  const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
  const needsRenewal = !expiresAt || expiresAt - Date.now() < 2 * 60 * 1000;
  const refreshToken = connection.refresh_token;
  if (!needsRenewal || !refreshToken) return connection.access_token;
  const clientId = Deno.env.get("DROPBOX_CLIENT_ID");
  const clientSecret = Deno.env.get("DROPBOX_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Dropbox needs to be reconnected.");
  const response = await fetch(DROPBOX_TOKEN_URL, { method: "POST", headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString() });
  if (!response.ok) throw new Error("Dropbox needs to be reconnected.");
  const tokenData = await response.json() as { access_token?: string; expires_in?: number; refresh_token?: string };
  if (!tokenData.access_token) throw new Error("Dropbox needs to be reconnected.");
  const nextExpiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null;
  const { error } = await supabase.from("dropbox_video_review_connections").update({ access_token: tokenData.access_token, refresh_token: tokenData.refresh_token || connection.refresh_token, access_token_expires_at: nextExpiresAt, updated_at: new Date().toISOString() }).eq("id", connection.id);
  if (error) throw new Error("Dropbox needs to be reconnected.");
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Creative playback service is unavailable." }, 503);

    const payload = (await req.json().catch(() => ({}))) as ResolvePayload;
    const itemId = payload.itemId?.trim();
    if (!itemId) return json({ error: "Choose an item to preview." }, 400);

    const serviceClient = createClient<any>(supabaseUrl, serviceRoleKey);
    const publicToken = payload.publicToken?.trim() ?? "";
    const shareLink = publicToken ? await resolveShareLink(serviceClient, publicToken) : null;
    let userId: string | null = null;

    if (publicToken && !shareLink) return json({ error: "This private review link is invalid or has expired." }, 404);
    if (!publicToken) {
      const auth = req.headers.get("Authorization") ?? "";
      const userClient = createClient<any>(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (userError || !user) return json({ error: "Unauthorized" }, 401);
      userId = user.id;
    }

    const { data: item, error: itemError } = await serviceClient.from("approval_request_items").select("id, title, source_file_name, review_url, approval_request_id").eq("id", itemId).maybeSingle();
    if (itemError || !item) return json({ error: "That review item is unavailable." }, 404);
    const { data: request, error: requestError } = await serviceClient.from("approval_requests").select("id, client_id, review_url").eq("id", item.approval_request_id).maybeSingle();
    if (requestError || !request) return json({ error: "That review delivery is unavailable." }, 404);

    if (shareLink) {
      if (shareLink.approval_request_id !== request.id) return json({ error: "This item is not part of this private review link." }, 403);
    } else if (userId) {
      const [{ data: client }, staff] = await Promise.all([serviceClient.from("clients").select("id").eq("user_id", userId).maybeSingle(), isStaff(serviceClient, userId)]);
      if (!staff && (!client || request.client_id !== client.id)) return json({ error: "You are not allowed to view this item." }, 403);
    }

    const { data: connection, error: connectionError } = await serviceClient.from("dropbox_video_review_connections").select("id, access_token, refresh_token, access_token_expires_at").eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (connectionError || !connection) return json({ error: "Dropbox is not connected for in-portal creative playback." }, 409);

    const reviewItem = item as ReviewItem;
    const reviewRequest = request as ReviewRequest;
    const itemUrl = normalizedDropboxLink(reviewItem.review_url ?? "");
    const deliveryUrl = normalizedDropboxLink(reviewRequest.review_url ?? "");
    const sourceUrl = itemUrl ?? deliveryUrl;
    if (!sourceUrl) return json({ error: "This review does not have a valid Dropbox source." }, 422);
    const accessToken = await renewDropboxAccessToken(serviceClient, connection as DropboxConnection);
    const metadataResponse = await fetch(DROPBOX_METADATA_URL, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ url: sourceUrl }) });
    const metadata = metadataResponse.ok ? await metadataResponse.json() as DropboxSharedLinkMetadata : null;
    let file: DropboxFile | null = null;
    if (metadata?.[".tag"] === "file") {
      if (!metadata.name || !REVIEWABLE_ASSET_EXTENSION.test(metadata.name)) return json({ error: "That Dropbox link is not a supported video or graphic file." }, 422);
      file = { ".tag": "file", name: metadata.name };
    }
    if (!file) file = await findFolderFile(accessToken, sourceUrl, reviewItem.source_file_name ?? reviewItem.title, reviewItem.title);
    if (!file) return json({ error: "This item could not be matched to a file in the Dropbox source." }, 404);

    const filePath = file.path_lower || file.path_display || null;
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await serviceClient.from("dropbox_review_video_playback_tokens").delete().lt("expires_at", new Date().toISOString());
    const { error: tokenError } = await serviceClient.from("dropbox_review_video_playback_tokens").insert({ token, item_id: reviewItem.id, user_id: userId, share_link_id: shareLink?.id ?? null, folder_url: sourceUrl, file_path: filePath, file_name: file.name, expires_at: expiresAt });
    if (tokenError) return json({ error: "Could not prepare secure creative playback." }, 503);
    return json({ url: `${supabaseUrl}/functions/v1/stream-dropbox-review-video?token=${encodeURIComponent(token)}`, file_name: file.name, expires_at: expiresAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not prepare this review item for preview.";
    console.error("Dropbox creative resolver failed", { message });
    return json({ error: message }, 500);
  }
});
