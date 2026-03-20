import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  try {
    const { to, subject, html, text, label, message_id } = await req.json()

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject, html' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const payload = {
      to,
      subject,
      html,
      text: text || '',
      from: 'Vektiss <noreply@notify.vektiss.com>',
      sender_domain: 'notify.vektiss.com',
      label: label || 'transactional',
      message_id: message_id || crypto.randomUUID(),
      queued_at: new Date().toISOString(),
    }

    const { data, error } = await supabase.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload,
    })

    if (error) {
      console.error('Failed to enqueue email', error)
      return new Response(
        JSON.stringify({ error: 'Failed to enqueue email' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, queue_id: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('send-transactional-email error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
