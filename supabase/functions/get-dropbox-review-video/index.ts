import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "private, no-store",
};

type ResolvePayload = { itemId?: string };
type ReviewItem = {
  id: string;
  title: string;
  source_file_name: string | null;
  approval_request_id: string;
};
type ReviewRequest = { id: string; client_id: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      .select("id, title, source_file_name, approval_request_id")
      .eq("id", itemId)
      .maybeSingle();
    if (itemError || !item) return json({ error: "That review video is unavailable." }, 404);

    const { data: request, error: requestError } = await serviceClient
      .from("approval_requests")
      .select("id, client_id")
      .eq("id", item.approval_request_id)
      .maybeSingle();
    if (requestError || !request) return json({ error: "That review delivery is unavailable." }, 404);
    if (!staff && (!client || request.client_id !== client.id)) return json({ error: "You are not allowed to view this video." }, 403);

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await serviceClient.from("dropbox_review_video_playback_tokens").delete().lt("expires_at", new Date().toISOString());
    const { error: tokenError } = await serviceClient
      .from("dropbox_review_video_playback_tokens")
      .insert({ token, item_id: item.id, user_id: user.id, expires_at: expiresAt });
    if (tokenError) return json({ error: "Could not prepare secure video playback." }, 503);

    const reviewItem = item as ReviewItem;
    return json({
      url: `${supabaseUrl}/functions/v1/stream-dropbox-review-video?token=${encodeURIComponent(token)}`,
      file_name: reviewItem.source_file_name ?? reviewItem.title,
      expires_at: expiresAt,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not prepare this video for playback." }, 500);
  }
});
