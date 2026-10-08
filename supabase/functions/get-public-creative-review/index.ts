import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "private, no-store",
};

type Payload = { token?: string };

type ServiceClient = ReturnType<typeof createClient<any>>;

type ReviewShareLink = {
  id: string;
  approval_request_id: string;
  expires_at: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function tokenHash(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function resolveShareLink(supabase: ServiceClient, token: string): Promise<ReviewShareLink | null> {
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  const { data, error } = await supabase
    .from("approval_review_share_links")
    .select("id, approval_request_id, expires_at")
    .eq("token_hash", await tokenHash(token))
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return error || !data ? null : data as ReviewShareLink;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Review service is unavailable." }, 503);

    const { token } = (await req.json().catch(() => ({}))) as Payload;
    const rawToken = token?.trim() ?? "";
    const service = createClient<any>(supabaseUrl, serviceRoleKey);
    const shareLink = await resolveShareLink(service, rawToken);
    if (!shareLink) return json({ error: "This private review link is invalid or has expired." }, 404);

    const { data: review, error } = await service
      .from("approval_requests")
      .select("id, title, description, phase, status, created_at, projects(name), approval_request_items(id, title, source_file_name, status, response_note, responded_at, viewed_at, position)")
      .eq("id", shareLink.approval_request_id)
      .maybeSingle();
    if (error || !review) return json({ error: "This creative review is no longer available." }, 404);

    await service
      .from("approval_review_share_links")
      .update({ last_accessed_at: new Date().toISOString() })
      .eq("id", shareLink.id);

    const project = Array.isArray(review.projects) ? review.projects[0] : review.projects;
    const items = [...(review.approval_request_items ?? [])].sort((a, b) => a.position - b.position);
    return json({
      review: {
        id: review.id,
        title: review.title,
        description: review.description,
        phase: review.phase,
        status: review.status,
        created_at: review.created_at,
        project_name: project?.name ?? null,
        expires_at: shareLink.expires_at,
        items,
      },
    });
  } catch (error) {
    console.error("Public creative review lookup failed", { message: error instanceof Error ? error.message : "Unknown error" });
    return json({ error: "Could not load this creative review." }, 500);
  }
});
