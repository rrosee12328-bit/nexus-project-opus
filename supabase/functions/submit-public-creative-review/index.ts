import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "private, no-store",
};

const RESPONSES = new Set(["approved", "rejected", "suggestions"]);
type Payload = { token?: string; itemId?: string; action?: "view" | "respond"; status?: string; responseNote?: string };
type ServiceClient = ReturnType<typeof createClient<any>>;
type ReviewShareLink = { id: string; approval_request_id: string };

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
    .select("id, approval_request_id")
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

    const payload = (await req.json().catch(() => ({}))) as Payload;
    const rawToken = payload.token?.trim() ?? "";
    const itemId = payload.itemId?.trim() ?? "";
    if (!itemId) return json({ error: "Choose a creative item first." }, 400);

    const service = createClient<any>(supabaseUrl, serviceRoleKey);
    const shareLink = await resolveShareLink(service, rawToken);
    if (!shareLink) return json({ error: "This private review link is invalid or has expired." }, 404);

    const { data: item, error: itemError } = await service
      .from("approval_request_items")
      .select("id, approval_request_id, status")
      .eq("id", itemId)
      .eq("approval_request_id", shareLink.approval_request_id)
      .maybeSingle();
    if (itemError || !item) return json({ error: "This creative item is unavailable from this review link." }, 404);

    if (payload.action === "view") {
      const { error } = await service
        .from("approval_request_items")
        .update({ viewed_at: new Date().toISOString() })
        .eq("id", item.id)
        .is("viewed_at", null);
      if (error) return json({ error: "Could not save the viewed state." }, 500);
      return json({ ok: true, action: "view" });
    }

    const status = payload.status?.trim() ?? "";
    const responseNote = payload.responseNote?.trim() || null;
    if (!RESPONSES.has(status)) return json({ error: "Choose approve, changes, or suggestions." }, 400);
    if ((status === "rejected" || status === "suggestions") && !responseNote) {
      return json({ error: status === "rejected" ? "Tell the team what needs to change." : "Add your suggestions before sending." }, 400);
    }
    if (item.status !== "pending") return json({ error: "This creative item already has a recorded decision." }, 409);

    const { data: updatedItems, error } = await service
      .from("approval_request_items")
      .update({ status, response_note: responseNote, responded_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("status", "pending")
      .select("id");
    if (error) return json({ error: "Could not save your response." }, 500);
    if (!updatedItems?.length) return json({ error: "This creative item was just decided elsewhere. Refresh to see the recorded decision." }, 409);

    return json({ ok: true, action: "respond", status });
  } catch (error) {
    console.error("Public creative review response failed", { message: error instanceof Error ? error.message : "Unknown error" });
    return json({ error: "Could not save your response." }, 500);
  }
});
