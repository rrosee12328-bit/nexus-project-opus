import { createClient } from "npm:@supabase/supabase-js@2";

const DROPBOX_TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const DROPBOX_METADATA_URL = "https://api.dropboxapi.com/2/sharing/get_shared_link_metadata";
const DROPBOX_LIST_FOLDER_URL = "https://api.dropboxapi.com/2/files/list_folder";
const DROPBOX_LIST_CONTINUE_URL = "https://api.dropboxapi.com/2/files/list_folder/continue";
const REVIEWABLE_ASSET_EXTENSION = /\.(mp4|mov|m4v|webm|avi|mkv|mpeg|mpg|jpg|jpeg|png|webp|gif|avif)$/i;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ImportPayload = { folderUrl?: string };
type DropboxFile = { ".tag": "file"; name: string };
type DropboxFolderResult = { entries: Array<DropboxFile | { ".tag": string; name?: string }>; cursor?: string; has_more?: boolean };

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

function titleFromFilename(name: string) {
  return name.replace(REVIEWABLE_ASSET_EXTENSION, "").trim() || name;
}

function basicAuth(clientId: string, clientSecret: string) {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

async function isStaff(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "ops"]).limit(1).maybeSingle();
  return !error && Boolean(data);
}

async function readDropboxError(response: Response) {
  const fallback = response.status === 401 ? "Dropbox needs to be reconnected." : "Dropbox could not access that shared folder.";
  try {
    const body = await response.json() as { error_summary?: string };
    if (body.error_summary?.includes("shared_link_not_found")) return "Dropbox could not find that shared folder link.";
    if (body.error_summary?.includes("shared_link_access_denied")) return "The connected Dropbox account cannot access that folder.";
  } catch { /* Keep the safe fallback message. */ }
  return fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const clientId = Deno.env.get("DROPBOX_CLIENT_ID");
    const clientSecret = Deno.env.get("DROPBOX_CLIENT_SECRET");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Dropbox import service is unavailable." }, 503);

    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    if (!(await isStaff(serviceClient, user.id))) return json({ error: "Only staff can import Dropbox creative file names" }, 403);

    const payload = (await req.json().catch(() => ({}))) as ImportPayload;
    const folderUrl = normalizedDropboxLink(payload.folderUrl ?? "");
    if (!folderUrl) return json({ error: "Enter a secure Dropbox folder or creative-file link first." }, 400);

    const { data: connection, error: connectionError } = await serviceClient.from("dropbox_video_review_connections").select("id, access_token, refresh_token, access_token_expires_at").eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (connectionError || !connection) return json({ error: "An admin needs to connect Dropbox before creative files can be imported." }, 409);

    let accessToken = connection.access_token;
    const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
    if (expiresAt && expiresAt < Date.now() + 60_000 && connection.refresh_token) {
      if (!clientId || !clientSecret) return json({ error: "Dropbox needs to be reconnected by an admin before files can be imported." }, 409);
      const refreshResponse = await fetch(DROPBOX_TOKEN_URL, { method: "POST", headers: { Accept: "application/json", Authorization: basicAuth(clientId, clientSecret), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: connection.refresh_token }).toString() });
      if (!refreshResponse.ok) return json({ error: "Dropbox needs to be reconnected before files can be imported." }, 409);
      const refreshed = await refreshResponse.json() as { access_token: string; refresh_token?: string; expires_in?: number };
      accessToken = refreshed.access_token;
      const nextExpiresAt = refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : null;
      const { error: updateError } = await serviceClient.from("dropbox_video_review_connections").update({ access_token: accessToken, refresh_token: refreshed.refresh_token ?? connection.refresh_token, access_token_expires_at: nextExpiresAt }).eq("id", connection.id);
      if (updateError) return json({ error: "Could not refresh the Dropbox connection." }, 500);
    }

    const metadataResponse = await fetch(DROPBOX_METADATA_URL, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ url: folderUrl }) });
    const metadata = metadataResponse.ok ? await metadataResponse.json() as { ".tag"?: string; name?: string } : null;
    if (metadata?.[".tag"] === "file") {
      if (!metadata.name || !REVIEWABLE_ASSET_EXTENSION.test(metadata.name)) return json({ error: "That Dropbox link is not a supported video or graphic file." }, 422);
      return json({ folderName: metadata.name, items: [{ name: metadata.name, title: titleFromFilename(metadata.name) }] });
    }
    if (metadata && metadata[".tag"] !== "folder") return json({ error: "That Dropbox link does not point to a folder or supported creative file." }, 422);

    const files: DropboxFile[] = [];
    let page: DropboxFolderResult | null = null;
    let pagesRead = 0;
    do {
      const response = await fetch(page?.cursor ? DROPBOX_LIST_CONTINUE_URL : DROPBOX_LIST_FOLDER_URL, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(page?.cursor ? { cursor: page.cursor } : { path: "", recursive: false, include_deleted: false, limit: 2000, shared_link: { url: folderUrl } }) });
      if (!response.ok) return json({ error: await readDropboxError(response) }, 422);
      page = await response.json() as DropboxFolderResult;
      files.push(...page.entries.filter((entry): entry is DropboxFile => entry[".tag"] === "file" && Boolean(entry.name) && REVIEWABLE_ASSET_EXTENSION.test(entry.name)));
      pagesRead += 1;
    } while (page.has_more && page.cursor && pagesRead < 5);

    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    const items = files.sort((a, b) => collator.compare(a.name, b.name)).map((file) => ({ name: file.name, title: titleFromFilename(file.name) }));
    if (!items.length) return json({ error: "No supported video or graphic files were found in that Dropbox folder." }, 422);
    return json({ folderName: metadata?.name ?? "Dropbox folder", items, truncated: Boolean(page?.has_more) });
  } catch {
    return json({ error: "Dropbox creative files could not be imported." }, 500);
  }
});
