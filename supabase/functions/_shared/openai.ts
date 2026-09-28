import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

export const AI_MODEL = "gpt-4.1-mini-2025-04-14";
const background = new Set(["analyze-call", "generate-client-summary", "score-call-attribution", "ai-insights"]);
const features = new Set([...background, "ai-agent", "brain-route", "polish-proposal", "onboarding-interview"]);
// USD per million tokens, verified against official model pricing 2026-09-27.
export function estimatedCost(input: number, output: number): number {
  return Math.ceil((input * 0.4 + output * 1.6)) / 1_000_000;
}
export async function inputFingerprint(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, "0")).join("");
}

/** Server-only adapter. No provider fallback; reservations fail closed. */
export async function openAIChat(feature: string, body: Record<string, unknown>, options: { cacheKey?: string } = {}): Promise<Response> {
  if (!features.has(feature)) throw new Error("Unknown AI feature");
  if (Deno.env.get("DIRECT_OPENAI_ENABLED") !== "true") throw new Error("Direct OpenAI rollout is not enabled");
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OpenAI is not configured");
  // Existing endpoints deliver their own chat transport. Reject unmetered upstream streams.
  if (body.stream) throw new Error("Use the portal chat transport, not an upstream stream");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const request = { ...body, model: AI_MODEL, stream: false, max_tokens: Math.min(Number(body.max_tokens) || 4096, 8192), store: false };
  const fingerprint = options.cacheKey ? await inputFingerprint([feature, options.cacheKey, request]) : null;
  let claimId: string | null = null;
  if (fingerprint) {
    const { data, error } = await admin.rpc("claim_ai_result", { p_fingerprint: fingerprint, p_feature: feature });
    if (error) throw new Error("AI processing claim unavailable");
    if (data.status === "cached") return Response.json(data.result);
    if (data.status !== "claimed") return Response.json({ error: "Analysis is already processing; retry manually later" }, { status: 409 });
    claimId = data.claim_id;
  }
  const mark = async (status: "failed" | "completed", result?: unknown) => {
    if (!fingerprint) return;
    const { error } = await admin.from("ai_result_cache").update({ status, ...(result ? { result } : {}), updated_at: new Date().toISOString() }).eq("fingerprint", fingerprint).eq("claim_id", claimId);
    if (error) throw new Error("AI result could not be saved; request remains reserved");
  };
  // UTF-8 bytes + framing is a conservative text upper bound, not a 4-char estimate.
  // Image parts reserve an additional conservative token allowance per image.
  const serialized = JSON.stringify(request);
  const inputCeiling = new TextEncoder().encode(serialized).length + 4096 + (serialized.match(/"image_url"/g)?.length || 0) * 32768;
  const cost = estimatedCost(inputCeiling, request.max_tokens);
  const { data: reservation, error: reserveError } = await admin.rpc("reserve_ai_cost", {
    p_category: background.has(feature) ? "background" : "interactive", p_feature: feature, p_model: AI_MODEL, p_cost: cost,
  });
  if (reserveError || !reservation?.allowed) {
    await mark("failed");
    return Response.json({ error: reserveError ? "AI budget check unavailable" : "Monthly AI allowance reached; core portal features remain available" }, { status: reserveError ? 503 : 402 });
  }
  const settle = async (status: string, actual: number, input?: number, output?: number) => {
    const { error } = await admin.rpc("settle_ai_cost", { p_id: reservation.id, p_status: status, p_cost: actual, p_input: input ?? null, p_output: output ?? null });
    if (error) throw new Error("AI usage settlement pending; reservation retained");
  };
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: serialized, signal: AbortSignal.timeout(90_000),
    });
  } catch {
    await settle("uncertain", cost);
    // Leave processing claim locked: the provider may have already billed this request.
    return Response.json({ error: "AI provider outcome unknown; staff review required" }, { status: 504 });
  }
  if (!response.ok) {
    const knownRejection = [400,401,403,404,422,429].includes(response.status);
    await settle(knownRejection ? "rejected" : "uncertain", cost);
    if (knownRejection) await mark("failed");
    return Response.json({ error: "OpenAI request failed", provider_status: response.status }, { status: knownRejection ? response.status : 502 });
  }
  let result;
  try { result = await response.json(); } catch {
    await settle("uncertain", cost);
    return Response.json({ error: "AI response incomplete; staff review required" }, { status: 502 });
  }
  // Save before downstream business writes so an explicit retry reuses paid output.
  await mark("completed", result);
  const input = result.usage?.prompt_tokens;
  const output = result.usage?.completion_tokens;
  const valid = Number.isInteger(input) && input >= 0 && Number.isInteger(output) && output >= 0;
  await settle(valid ? "completed" : "uncertain", valid ? estimatedCost(input, output) : cost, input, output);
  return Response.json(result);
}
