// Score each call's primary topic (Vektiss vs Crown And Associates vs Other vs Unclear)
// using transcript/summary text. Admin only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const SYSTEM_PROMPT = `You classify the PRIMARY topic of a meeting recording into one of:
- "vektiss" — Vektiss internal company operations (Vektiss financials, Vektiss clients, Vektiss strategy, Vektiss team, Vektiss product/portal).
- "crown" — Crown And Associates business (Greg McCain's other company; Crown clients, Crown operations, Crown projects unrelated to Vektiss).
- "other" — clearly about a different topic / a third party / unrelated personal matter.
- "unclear" — too little content or evenly split; cannot decide.

Greg McCain is involved in both companies. Decide based on the DOMINANT topic of the conversation, not who is present.
Return JSON only: {"label":"vektiss|crown|other|unclear","confidence":0.0-1.0,"reason":"<= 16 words"}`;

async function classify(text: string): Promise<{ label: string; confidence: number; reason: string } | null> {
  const body = {
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
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
    const label = ["vektiss", "crown", "other", "unclear"].includes(parsed.label) ? parsed.label : "unclear";
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
      .select("id, transcript, summary")
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
      const out = await classify(text);
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