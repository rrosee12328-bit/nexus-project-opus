import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return json({ error: "Unauthorized" }, 401);
    const { data: client } = await admin.from("clients").select("id, name, type").eq("user_id", auth.user.id).maybeSingle();
    if (!client) return json({ error: "Client workspace not linked" }, 403);

    const body = await req.json();
    const { data: session } = await admin.from("onboarding_sessions").select("*").eq("id", body.session_id).eq("client_id", client.id).maybeSingle();
    if (!session || session.status === "completed") return json({ error: "Onboarding session is unavailable" }, 409);
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
    const apiKey = lovableApiKey || openAiApiKey;
    const aiUrl = lovableApiKey
      ? "https://ai.gateway.lovable.dev/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
    if (!apiKey) return json({ error: "AI provider is not configured" }, 500);

    const { data: responses } = await admin.from("onboarding_responses")
      .select("question_key, question_prompt, answer_text, transcript_text, created_at")
      .eq("session_id", session.id).order("created_at");

    if (body.action === "summarize") {
      const source = (responses || []).map((item) => `Question: ${item.question_prompt}\nAnswer: ${item.transcript_text || item.answer_text || ""}`).join("\n\n");
      const summary = await ask(aiUrl, apiKey, `Create a concise, client-facing onboarding brief from the source answers below. Use these headings: Business Overview, Goals, Audience, Brand Voice, Success Measures, Approval Process, Assets and Access, Service-Specific Details, and Open Items. Do not invent facts, mention internal systems, or include anything not stated by the client.\n\n${source}`);
      await admin.from("onboarding_sessions").update({ status: "review", approved_summary: summary, pending_follow_up: null, pending_follow_up_for_key: null }).eq("id", session.id);
      return json({ summary });
    }

    const { data: response } = await admin.from("onboarding_responses")
      .select("question_key, question_prompt, answer_text, transcript_text")
      .eq("id", body.response_id).eq("session_id", session.id).maybeSingle();
    if (!response) return json({ error: "Response not found" }, 404);
    const baseKey = String(body.base_question_key || response.question_key).split("__followup_")[0];
    const followUpCount = (responses || []).filter((item) => item.question_key.startsWith(`${baseKey}__followup_`)).length;
    const answer = String(response.transcript_text || response.answer_text || "").trim();

    let followUp: string | null = null;
    if (followUpCount < 2) {
      const result = await ask(aiUrl, apiKey, `You are conducting a client onboarding interview. Decide whether one concise clarification is necessary to make the answer usable. Never ask about internal pricing, competitors' confidential information, credentials, passwords, or unrelated personal data. Return only JSON in this form: {"complete":true,"follow_up":null} or {"complete":false,"follow_up":"question"}.\n\nQuestion: ${response.question_prompt}\nAnswer: ${answer}`);
      try {
        const parsed = JSON.parse(result.replace(/^```json\s*|\s*```$/g, ""));
        if (parsed.complete === false && typeof parsed.follow_up === "string") followUp = parsed.follow_up.trim();
      } catch {
        followUp = answer.length < 24 ? "Could you share a little more detail so your team can act on this?" : null;
      }
    }

    await admin.from("onboarding_sessions").update(followUp ? {
      pending_follow_up: followUp,
      pending_follow_up_for_key: baseKey,
      status: "in_progress",
    } : {
      pending_follow_up: null,
      pending_follow_up_for_key: null,
      current_question_index: session.current_question_index + 1,
      status: "in_progress",
    }).eq("id", session.id);
    return json({ complete: !followUp, follow_up: followUp });
  } catch (error) {
    console.error("onboarding-interview", error);
    return json({ error: error instanceof Error ? error.message : "Onboarding request failed" }, 500);
  }
});

async function ask(aiUrl: string, apiKey: string, prompt: string) {
  const response = await fetch(aiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.1, messages: [{ role: "user", content: prompt }] }),
  });
  if (!response.ok) throw new Error(`Onboarding AI failed (${response.status})`);
  const data = await response.json();
  return String(data.choices?.[0]?.message?.content || "").trim();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
