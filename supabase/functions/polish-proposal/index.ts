import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const anonClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const token = authHeader.replace('Bearer ', '')
  const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token)
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { servicesDescription, clientName, companyName, setupFee, monthlyFee, billingSchedule } = await req.json()

    if (!servicesDescription || typeof servicesDescription !== 'string') {
      return new Response(JSON.stringify({ error: 'servicesDescription is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const billingLabel = billingSchedule === 'bimonthly'
      ? `$${(Number(monthlyFee) / 2).toFixed(2)} bi-monthly (15th & 30th)`
      : `$${Number(monthlyFee)} monthly`

    const systemPrompt = `You are a professional business proposal writer for Vektiss LLC, an AI & Automation services company. 
Your job is to take rough, informal service descriptions and polish them into professional, clear, compelling proposal language.

Rules:
- Keep it concise but professional (3-8 bullet points or a short paragraph)
- Use clear business language, no jargon unless appropriate
- Maintain the original intent and all specific details
- Format as a clean list of services using bullet points (• prefix)
- Do NOT add services that weren't mentioned
- Do NOT include pricing or payment terms (those are handled separately)
- Do NOT include greetings, signatures, or meta-commentary
- IMPORTANT: Output PLAIN TEXT only. Do NOT use markdown formatting of any kind — no **bold**, no *italics*, no #headings, no backticks. The text is rendered directly to clients and stray asterisks look unprofessional.
- Just return the polished services description text, nothing else`

    const userPrompt = `Polish this services description for a proposal to ${clientName || 'the client'}${companyName ? ` at ${companyName}` : ''}:

"${servicesDescription}"

Context: Setup fee is $${setupFee || 0}, billing is ${billingLabel}.`

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!aiResponse.ok) {
      const status = aiResponse.status
      if (status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limited, please try again shortly.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      throw new Error(`AI gateway error: ${status}`)
    }

    const result = await aiResponse.json()
    const raw = result.choices?.[0]?.message?.content?.trim() || servicesDescription
    // Defensive: strip any markdown bold/italic markers the model may still emit
    const polished = raw
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/(?<!\*)\*(?!\*)([^*\n]+)\*(?!\*)/g, '$1')
      .replace(/^#+\s+/gm, '')

    return new Response(JSON.stringify({ polished }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('polish-proposal error:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
