import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FROM_EMAIL = 'Vektiss <noreply@mail.vektiss.com>'
const SENDER_DOMAIN = 'mail.vektiss.com'
const PORTAL_URL = 'https://nexus-project-opus.lovable.app'

function buildEmailHtml(title: string, body: string, ctaLabel?: string, ctaUrl?: string): string {
  let ctaBlock = ''
  if (ctaLabel && ctaUrl) {
    ctaBlock = `<a href="${ctaUrl}" style="display: inline-block; background-color: hsl(213, 100%, 58%); color: #ffffff; font-size: 14px; font-weight: 600; border-radius: 6px; padding: 12px 24px; text-decoration: none;">${ctaLabel}</a>`
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family: Inter, Arial, sans-serif; background-color: #ffffff; padding: 40px 25px;">
  <h1 style="font-size: 24px; font-weight: bold; color: #0d0d0d; margin: 0 0 20px;">${title}</h1>
  <p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 25px;">${body}</p>
  ${ctaBlock}
  <p style="font-size: 12px; color: #999999; margin: 30px 0 0;">This is an automated notification from Vektiss.</p>
</body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Auth check: require a valid JWT from an authenticated user
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Verify the caller's JWT using the anon client
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

  // Only admin and ops roles can send transactional emails
  const callerUserId = claimsData.claims.sub as string
  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', callerUserId)
  const roles = (roleData ?? []).map((r: any) => r.role)
  if (!roles.includes('admin') && !roles.includes('ops')) {
    return new Response(JSON.stringify({ error: 'Forbidden: insufficient role' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const { to, subject, html, text, label, message_id, event, eventData } = body

    // Handle structured event-based emails
    if (event && eventData) {
      const result = await handleEventEmail(supabase, event, eventData)
      if (result.error) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ success: true, queue_id: result.queue_id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Legacy direct send
    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject, html' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const payload = {
      to, subject, html, text: text || '',
      from: FROM_EMAIL, sender_domain: SENDER_DOMAIN,
      label: label || 'transactional',
      message_id: message_id || crypto.randomUUID(),
      queued_at: new Date().toISOString(),
    }

    const { data, error } = await supabase.rpc('enqueue_email', {
      queue_name: 'transactional_emails', payload,
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

async function handleEventEmail(
  supabase: ReturnType<typeof createClient>,
  event: string,
  data: Record<string, unknown>
): Promise<{ error?: string; queue_id?: number }> {
  let to = ''
  let subject = ''
  let html = ''
  let plainText = ''
  let emailLabel = ''

  switch (event) {
    case 'task_assigned': {
      const { task_id, assigned_to_user_id } = data as { task_id: string; assigned_to_user_id: string }
      if (!task_id || !assigned_to_user_id) return { error: 'Missing task_id or assigned_to_user_id' }

      const { data: task } = await supabase.from('tasks').select('title, due_date, priority').eq('id', task_id).single()
      if (!task) return { error: 'Task not found' }

      const { data: { user } } = await supabase.auth.admin.getUserById(assigned_to_user_id)
      if (!user?.email) return { error: 'Assignee has no email' }

      const { data: profile } = await supabase.from('profiles').select('display_name').eq('user_id', assigned_to_user_id).single()
      const name = profile?.display_name || 'there'

      to = user.email
      subject = `New task assigned: ${task.title}`
      emailLabel = 'task_assigned'
      const dueInfo = task.due_date ? ` It's due on <strong>${task.due_date}</strong>.` : ''
      html = buildEmailHtml(
        'New task assigned to you',
        `Hi ${name}, you've been assigned a new task: "<strong>${task.title}</strong>" (${task.priority} priority).${dueInfo}`,
        'View Tasks', `${PORTAL_URL}/ops/tasks`
      )
      plainText = `Hi ${name}, you've been assigned "${task.title}".`
      break
    }

    case 'payment_recorded': {
      const { client_id, amount, payment_month, payment_year } = data as {
        client_id: string; amount: number; payment_month: number; payment_year: number
      }
      if (!client_id) return { error: 'Missing client_id' }

      const { data: client } = await supabase.from('clients').select('email, name').eq('id', client_id).single()
      if (!client?.email) return { error: 'Client has no email' }

      const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
      const monthName = months[(payment_month || 1) - 1]

      to = client.email
      subject = `Payment confirmed — ${monthName} ${payment_year}`
      emailLabel = 'payment_recorded'
      html = buildEmailHtml(
        'Payment Confirmed',
        `Hi ${client.name ?? 'there'}, we've recorded a payment of <strong>$${Number(amount).toLocaleString()}</strong> for <strong>${monthName} ${payment_year}</strong>.`,
        'View Payment History', `${PORTAL_URL}/portal/payments`
      )
      plainText = `Hi ${client.name ?? 'there'}, a payment of $${amount} for ${monthName} ${payment_year} has been confirmed.`
      break
    }

    case 'project_status_changed': {
      const { project_id, new_status } = data as { project_id: string; new_status: string }
      if (!project_id) return { error: 'Missing project_id' }

      const { data: project } = await supabase.from('projects').select('name, client_id').eq('id', project_id).single()
      if (!project) return { error: 'Project not found' }

      const { data: client } = await supabase.from('clients').select('email, name').eq('id', project.client_id).single()
      if (!client?.email) return { error: 'Client has no email' }

      const statusLabel = (new_status || '').replace(/_/g, ' ')
      to = client.email
      subject = `Project update: ${project.name}`
      emailLabel = 'project_status_change'
      html = buildEmailHtml(
        'Project Update',
        `Hi ${client.name ?? 'there'}, your project "<strong>${project.name}</strong>" status has been updated to <strong>${statusLabel}</strong>.`,
        'View Project', `${PORTAL_URL}/portal/projects`
      )
      plainText = `Hi ${client.name ?? 'there'}, your project "${project.name}" status changed to ${statusLabel}.`
      break
    }

    case 'proposal_link': {
      const { recipient_email, client_name, proposal_url } = data as {
        recipient_email: string; client_name: string; proposal_url: string
      }
      if (!recipient_email || !proposal_url) return { error: 'Missing recipient_email or proposal_url' }

      to = recipient_email
      subject = 'Your Proposal from Vektiss'
      emailLabel = 'proposal_link'
      html = buildEmailHtml(
        'Your Proposal is Ready',
        `Hi ${client_name || 'there'}, we've prepared a proposal for you. Please review the details, sign the agreement, and complete payment to get started.`,
        'View Proposal', proposal_url
      )
      plainText = `Hi ${client_name || 'there'}, your proposal from Vektiss is ready. View it here: ${proposal_url}`
      break
    }

    default:
      return { error: `Unknown event: ${event}` }
  }

  const msgId = crypto.randomUUID()
  const { data: queueId, error } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      to, from: FROM_EMAIL, sender_domain: SENDER_DOMAIN,
      subject, html, text: plainText,
      label: emailLabel, message_id: msgId,
      queued_at: new Date().toISOString(),
    },
  })

  if (error) {
    console.error('Failed to enqueue event email', error)
    return { error: 'Failed to enqueue email' }
  }

  return { queue_id: queueId }
}
