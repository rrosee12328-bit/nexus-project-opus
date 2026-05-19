// Score each call's primary topic (Vektiss vs Crown And Associates vs Other vs Unclear)
// using transcript/summary text. Admin only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

function buildSystemPrompt(clientName: string | null, isInternal: boolean) {
  if (isInternal) {
    return `You classify the PRIMARY topic of a meeting where the linked client record is the INTERNAL Vektiss company.
Labels:
- "vektiss" — Vektiss internal operations (default when meeting is internal).
- "crown" — Crown And Associates business (Greg McCain's other company).
- "other" — clearly about a different third party / unrelated matter.
- "unclear" — too little content to decide.
Default to "vektiss" unless the conversation is overwhelmingly about Crown or another company.
Return JSON only: {"label":"vektiss|crown|other|unclear","confidence":0.0-1.0,"reason":"<= 16 words"}`;
  }
  return `You classify the PRIMARY topic of a meeting that is linked to client: "${clientName}".
When a call is attributed to a specific client, the focus is ASSUMED to be that client and their project — not Vektiss internal operations — unless the transcript clearly shows otherwise.
Labels:
- "client" — the conversation is primarily about ${clientName} and/or their project (this is the default).
- "vektiss" — overwhelmingly about Vektiss internal company operations, not this client.
- "other" — about a different third party entirely.
- "unclear" — too little content to decide.
Default to "client" unless evidence is strong otherwise. Discussions of deliverables, strategy, content, or work FOR this client all count as "client".
Return JSON only: {"label":"client|vektiss|other|unclear","confidence":0.0-1.0,"reason":"<= 16 words"}`;
}

const VEKTISS_INTERNAL_CLIENT_ID = "7662c4e3-bf78-494e-b203-40a9ba06fb27";

async function classify(text: string, clientName: string | null, isInternal: boolean): Promise<{ label: string; confidence: number; reason: string } | null> {
  const body = {
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: buildSystemPrompt(clientName, isInternal) },
      { role: "user", content: `TRANSCRIPT/SUMMARY:\n${(text || "").slice(0, 12000)}` },
    ],
    response_format: { type: "json_object" },
  };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("gateway error", res.status, await res.text());
    return null;
  }
  const j = await res.json();
  try {
    const raw = j?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const allowed = isInternal
      ? ["vektiss", "crown", "other", "unclear"]
      : ["client", "vektiss", "other", "unclear"];
    const label = allowed.includes(parsed.label) ? parsed.label : "unclear";
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0)));
    const reason = String(parsed.reason ?? "").slice(0, 240);
    return { label, confidence, reason };
  } catch (e) {
    console.error("parse error", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { call_id, rescore_all } = await req.json().catch(() => ({}));

    let query = supabase
      .from("call_intelligence")
      .select("id, transcript, summary, client_id, clients:client_id(name)")
      .order("call_date", { ascending: false });

    if (call_id) {
      query = query.eq("id", call_id);
    } else if (!rescore_all) {
      query = query.is("primary_topic", null);
    }

    const { data: calls, error } = await query.limit(200);
    if (error) throw error;

    let scored = 0;
    let skipped = 0;
    const results: Array<{ id: string; label?: string; confidence?: number }> = [];

    for (const c of calls ?? []) {
      const text = (c.transcript || c.summary || "").trim();
      if (text.length < 80) {
        skipped++;
        results.push({ id: c.id });
        continue;
      }
      const isInternal = (c as any).client_id === VEKTISS_INTERNAL_CLIENT_ID || !(c as any).client_id;
      const clientName = (c as any).clients?.name ?? null;
      const out = await classify(text, clientName, isInternal);
      if (!out) {
        skipped++;
        results.push({ id: c.id });
        continue;
      }
      const { error: upErr } = await supabase
        .from("call_intelligence")
        .update({
          primary_topic: out.label,
          topic_confidence: out.confidence,
          topic_reason: out.reason,
          topic_scored_at: new Date().toISOString(),
        })
        .eq("id", c.id);
      if (upErr) {
        console.error("update error", c.id, upErr);
        skipped++;
      } else {
        scored++;
        results.push({ id: c.id, label: out.label, confidence: out.confidence });
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    return new Response(JSON.stringify({ scored, skipped, total: calls?.length ?? 0, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});