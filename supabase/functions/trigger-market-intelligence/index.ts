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

function parseInsights(rawResponse: string): any[] | null {
  // Strip markdown fences anywhere in the response, then parse
  let cleaned = rawResponse.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  try {
    const parsed = JSON.parse(cleaned);
    const arr = parsed.insights ?? parsed;
    return Array.isArray(arr) ? arr : null;
  } catch {
    const match = rawResponse.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      const arr = parsed.insights ?? parsed;
      return Array.isArray(arr) ? arr : null;
    } catch {
      return null;
    }
  }
}

async function callPerplexity(apiKey: string, systemPrompt: string, userPrompt: string) {
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
  const text = await res.text();
  if (!res.ok) throw new Error(`Perplexity ${res.status}: ${text.slice(0, 400)}`);
  const data = JSON.parse(text);
  return {
    content: data?.choices?.[0]?.message?.content ?? '',
    citations: data?.citations ?? [],
  };
}

async function autoCreateTasksFromInsights(
  admin: any,
  insights: any[],
  reportId: string,
  clientId: string | null,
) {
  // Determine the client to attach tasks to. For agency reports, fall back to the internal Vektiss client.
  let taskClientId = clientId;
  if (!taskClientId) {
    const { data: vektiss } = await admin
      .from('clients')
      .select('id')
      .eq('type', 'internal')
      .ilike('name', 'vektiss')
      .maybeSingle();
    taskClientId = vektiss?.id ?? null;
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 2);
  const dueDateStr = dueDate.toISOString().slice(0, 10);

  let createdCount = 0;
  for (const insight of insights) {
    if (insight?.urgency !== 'high') continue;
    if (!insight?.recommended_action) continue;
    const title = `[Intel] ${(insight.title ?? 'Market insight action').slice(0, 120)}`;
    const description = [
      insight.summary ?? '',
      '',
      `**Recommended action:** ${insight.recommended_action}`,
      insight.sources?.length ? `\n**Sources:**\n${insight.sources.map((s: string) => `- ${s}`).join('\n')}` : '',
    ].join('\n');

    const { error } = await admin.from('tasks').insert({
      title,
      description,
      status: 'todo',
      priority: 'high',
      client_id: taskClientId,
      due_date: dueDateStr,
      source_market_insight_id: reportId,
    });
    if (!error) createdCount++;
  }
  return createdCount;
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

    // --- Parse body for report_type ---
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body OK */ }
    const reportType: 'agency' | 'client' = body?.report_type === 'client' ? 'client' : 'agency';

    // ============================================================
    // CLIENT MODE: loop active clients, generate one report each
    // ============================================================
    if (reportType === 'client') {
      const { data: activeClients, error: clientsErr } = await admin
        .from('clients')
        .select('id, name, type, monthly_fee')
        .eq('status', 'active')
        .neq('type', 'internal');
      if (clientsErr) return json(500, { error: clientsErr.message });

      const results: any[] = [];
      for (const client of activeClients ?? []) {
        const systemPrompt = `You are a content strategist for Vektiss, a Houston-based agency producing short-form content (Instagram Reels, TikTok, YouTube Shorts) for SMEs. Your job: surface 2-3 CURRENT, actionable opportunities specifically for ONE client based on their industry. Use live web search and ground every insight in a specific event, trend, or piece of news from the past 7 days. No generic advice.`;

        const userPrompt = `Client: ${client.name}\nIndustry/Type: ${client.type ?? 'unspecified'}\nMonthly retainer: $${client.monthly_fee ?? 0}\n\nReturn STRICT JSON only — no prose, no markdown fences. Exact shape:\n{\n  "insights": [\n    {\n      "title": "specific headline tied to a current event or trend",\n      "type": "opportunity|risk|trend|competitor",\n      "summary": "2-3 sentences explaining the current event/trend AND why it matters for ${client.name} specifically given their industry. Cite what happened in the past 7 days.",\n      "recommended_action": "ONE concrete content idea Vektiss should produce for ${client.name} this week (e.g. 'Reel: 3 things ${client.type ?? 'businesses like this'} should do about [specific recent event]')",\n      "urgency": "high|medium|low",\n      "relevant_to": "all",\n      "sources": ["https://..."]\n    }\n  ]\n}\n\nReturn 2-3 insights. Every insight MUST cite at least one URL from the past 7 days. Tailor every recommendation to ${client.name}'s industry — no generic agency advice.`;

        try {
          const { content, citations } = await callPerplexity(PERPLEXITY_API_KEY, systemPrompt, userPrompt);
          const insights = parseInsights(content) ?? [];

          const { data: inserted, error: insertErr } = await admin
            .from('market_intelligence')
            .insert({
              client_id: client.id,
              report_type: 'client',
              context_snapshot: { client_name: client.name, client_type: client.type, monthly_fee: client.monthly_fee },
              insights: insights.length ? insights : { raw: content, citations },
              raw_response: content,
              model_used: 'sonar-pro',
            })
            .select()
            .single();

          if (insertErr) {
            await logError(admin, 'store_intelligence', `${client.name}: ${insertErr.message}`, null);
            results.push({ client: client.name, error: insertErr.message });
            continue;
          }

          const taskCount = await autoCreateTasksFromInsights(admin, insights, inserted.id, client.id);
          results.push({ client: client.name, report_id: inserted.id, insight_count: insights.length, tasks_created: taskCount });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await logError(admin, 'perplexity_call', `${client.name}: ${msg}`, null);
          results.push({ client: client.name, error: msg });
        }
      }

      return json(200, {
        success: true,
        response: 'Per-client market intelligence generated.',
        report_type: 'client',
        client_count: results.length,
        results,
      });
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

    let rawResponse = '';
    let citations: string[] = [];
    try {
      const result = await callPerplexity(PERPLEXITY_API_KEY, systemPrompt, userPrompt);
      rawResponse = result.content;
      citations = result.citations;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logError(admin, 'perplexity_call', msg, { context });
      return json(502, { error: `Perplexity call failed: ${msg}` });
    }

    const insights = parseInsights(rawResponse);
    if (!insights) {
      await logError(admin, 'parse_insights', 'Could not parse JSON from Perplexity response', { raw: rawResponse.slice(0, 1000) });
    }

    // --- Store result ---
    const { data: inserted, error: insertErr } = await admin
      .from('market_intelligence')
      .insert({
        report_type: 'agency',
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

    // --- Auto-create tasks for high-urgency insights ---
    let tasksCreated = 0;
    if (Array.isArray(insights) && insights.length > 0) {
      tasksCreated = await autoCreateTasksFromInsights(admin, insights, inserted.id, null);
    }

    return json(200, {
      success: true,
      response: 'Market intelligence generated and saved.',
      report_type: 'agency',
      report_id: inserted?.id,
      insight_count: Array.isArray(insights) ? insights.length : (insights?.length ?? 0),
      tasks_created: tasksCreated,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('trigger-market-intelligence error', msg);
    await logError(admin, 'unhandled', msg, null);
    return json(500, { error: msg });
  }
});