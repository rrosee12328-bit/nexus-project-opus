import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function logError(admin: any, stage: string, message: string, payload: unknown) {
  try {
    await admin.from('market_intelligence_errors').insert({
      stage,
      error_message: message,
      raw_payload: payload as any,
      trigger_source: 'brain_hub_run_now',
    });
  } catch (e) {
    console.error('Failed to log error', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // --- Auth: must be an admin ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'Unauthorized' });

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json(401, { error: 'Unauthorized' });
    const userId = claimsData.claims.sub as string;
    const { data: isAdmin } = await userClient.rpc('has_role', { _user_id: userId, _role: 'admin' });
    if (!isAdmin) return json(403, { error: 'Forbidden' });

    if (!PERPLEXITY_API_KEY) {
      await logError(admin, 'config', 'PERPLEXITY_API_KEY not configured', null);
      return json(500, { error: 'PERPLEXITY_API_KEY not configured' });
    }

    // --- Fetch business context ---
    let context: any = {};
    try {
      const [clientsRes, proposalsRes, leadsRes] = await Promise.all([
        admin.from('clients').select('id,name,status,monthly_fee,service_type,created_at').limit(200),
        admin.from('proposals').select('id,client_name,status,setup_fee,monthly_fee,created_at').limit(100),
        admin.from('leads').select('id,name,status,source,created_at').limit(100),
      ]);
      const clients = clientsRes.data ?? [];
      const proposals = proposalsRes.data ?? [];
      const leads = leadsRes.data ?? [];
      context = {
        client_count: clients.length,
        active_clients: clients.filter((c: any) => c.status === 'active').length,
        services_offered: [...new Set(clients.map((c: any) => c.service_type).filter(Boolean))],
        proposal_count: proposals.length,
        proposals_pending: proposals.filter((p: any) => ['sent', 'viewed', 'draft'].includes(p.status)).length,
        lead_count: leads.length,
        lead_sources: [...new Set(leads.map((l: any) => l.source).filter(Boolean))],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logError(admin, 'fetch_context', msg, null);
      return json(500, { error: `Context fetch failed: ${msg}` });
    }

    // --- Call Perplexity ---
    const systemPrompt = `You are a market intelligence analyst for Vektiss, a US-based digital agency headquartered in Houston, TX. Vektiss specializes in: business media production, short-form content (Instagram Reels, TikTok, YouTube Shorts), web development, and AI phone/email assistants for SMEs and entrepreneurs.\n\nYour job: surface 4-5 CURRENT, actionable market insights from the past 7 days. Use live web search to ground every single insight in a specific recent event, announcement, news article, or data point. No generic advice. No evergreen tips. Every insight must be tied to something that happened or was published this week.\n\nSearch coverage areas:\n1. Instagram, TikTok, and YouTube Shorts algorithm changes or policy updates\n2. Emerging short-form content formats and creator economy trends gaining traction\n3. US SME and entrepreneur content marketing trends\n4. Competitor digital agency moves, acquisitions, or new service launches (US market focus)\n5. AI tools disrupting short-form video production or web development`;

    const userPrompt = `Vektiss current business snapshot (use this to tailor every insight):\n${JSON.stringify(context, null, 2)}\n\nReturn STRICT JSON only — no prose, no markdown fences. Exact shape:\n{\n  "insights": [\n    {\n      "title": "short, specific headline referencing the actual event",\n      "type": "opportunity|risk|trend|competitor",\n      "summary": "2-3 sentences grounded in a specific current event from the past 7 days. Cite what happened, when, and why it matters to Vektiss specifically given the book of business above.",\n      "recommended_action": "one concrete action Vektiss should take THIS WEEK (specific, not generic)",\n      "urgency": "high|medium|low",\n      "relevant_to": "business_media|web_dev|phone_assistant|all",\n      "sources": ["https://...","https://..."]\n    }\n  ]\n}\n\nReturn 4-5 insights. Every insight MUST cite at least one source URL from the past 7 days.`;

    let pplxData: any;
    let rawResponse = '';
    try {
      const pplxRes = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          search_recency_filter: 'week',
        }),
      });
      const text = await pplxRes.text();
      if (!pplxRes.ok) {
        await logError(admin, 'perplexity_call', `${pplxRes.status}: ${text.slice(0, 500)}`, { context });
        return json(502, { error: `Perplexity error ${pplxRes.status}`, body: text.slice(0, 500) });
      }
      pplxData = JSON.parse(text);
      rawResponse = pplxData?.choices?.[0]?.message?.content ?? '';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logError(admin, 'perplexity_call', msg, { context });
      return json(502, { error: `Perplexity call failed: ${msg}` });
    }

    // --- Parse insights JSON (tolerate code fences) ---
    let insights: any = null;
    try {
      // Strip code fences anywhere in the response
      let cleaned = rawResponse.trim();
      const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenceMatch) cleaned = fenceMatch[1].trim();
      const parsed = JSON.parse(cleaned);
      insights = parsed.insights ?? parsed;
    } catch (e) {
      // Greedy match the largest { ... } block
      const match = rawResponse.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          insights = parsed.insights ?? parsed;
        } catch {
          await logError(admin, 'parse_insights', 'Could not parse JSON from Perplexity response', { raw: rawResponse.slice(0, 1000) });
        }
      } else {
        await logError(admin, 'parse_insights', 'No JSON object in Perplexity response', { raw: rawResponse.slice(0, 1000) });
      }
    }

    // --- Store result ---
    const citations = pplxData?.citations ?? [];
    const { data: inserted, error: insertErr } = await admin
      .from('market_intelligence')
      .insert({
        context_snapshot: context,
        insights: insights ?? { raw: rawResponse, citations },
        raw_response: rawResponse,
        model_used: 'sonar-pro',
      })
      .select()
      .single();

    if (insertErr) {
      await logError(admin, 'store_intelligence', insertErr.message, { context });
      return json(500, { error: `Store failed: ${insertErr.message}` });
    }

    return json(200, {
      success: true,
      response: 'Market intelligence generated and saved.',
      report_id: inserted?.id,
      insight_count: Array.isArray(insights) ? insights.length : (insights?.length ?? 0),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('trigger-market-intelligence error', msg);
    await logError(admin, 'unhandled', msg, null);
    return json(500, { error: msg });
  }
});