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
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(url, serviceRole);
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return json({ error: "Unauthorized" }, 401);

    const { response_id } = await req.json();
    const { data: client } = await admin.from("clients").select("id").eq("user_id", auth.user.id).maybeSingle();
    if (!client) return json({ error: "Client workspace not linked" }, 403);

    const { data: response, error } = await admin.from("onboarding_responses")
      .select("id, client_id, recording_path")
      .eq("id", response_id).eq("client_id", client.id).maybeSingle();
    if (error || !response?.recording_path) return json({ error: "Recording not found" }, 404);

    await admin.from("onboarding_responses").update({ transcription_status: "processing" }).eq("id", response.id);
    const { data: audio, error: downloadError } = await admin.storage.from("onboarding-recordings").download(response.recording_path);
    if (downloadError || !audio) throw downloadError || new Error("Unable to download recording");

    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) throw new Error("OPENAI_API_KEY is not configured");
    const form = new FormData();
    form.append("model", "gpt-transcribe");
    form.append("file", audio, response.recording_path.split("/").pop() || "response.webm");
    const transcriptionResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}` },
      body: form,
    });
    if (!transcriptionResponse.ok) throw new Error(`Transcription failed (${transcriptionResponse.status})`);
    const transcription = await transcriptionResponse.json();
    const transcript = String(transcription.text || "").trim();
    if (!transcript) throw new Error("No speech was detected in the recording");

    await admin.from("onboarding_responses").update({
      transcript_text: transcript,
      answer_text: transcript,
      transcription_status: "completed",
    }).eq("id", response.id);
    return json({ transcript });
  } catch (error) {
    console.error("transcribe-onboarding-response", error);
    return json({ error: error instanceof Error ? error.message : "Transcription failed" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
