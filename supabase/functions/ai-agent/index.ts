import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_clients',
      description: 'Search or list clients. Can filter by name, status, or get all clients with their details including email, phone, monthly fee, setup fee, balance due, start date.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Optional client name to search for (partial match)' },
          status: { type: 'string', enum: ['active', 'onboarding', 'closed', 'prospect', 'lead'], description: 'Optional status filter' },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_projects',
      description: 'Get projects, optionally filtered by client_id or status. Returns project name, status, phase, progress, dates, and client name.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string', description: 'Optional client ID to filter projects' },
          status: { type: 'string', enum: ['not_started', 'in_progress', 'completed', 'on_hold'] },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_financials',
      description: 'Get financial data: payments, expenses, investments, client costs, and business overhead. Can filter by client_id, year, or month.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string', description: 'Optional client ID for client-specific financials' },
          year: { type: 'number', description: 'Optional year filter (e.g. 2026)' },
          month: { type: 'number', description: 'Optional month filter (1-12)' },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_tasks',
      description: 'Get tasks, optionally filtered by status, priority, or assigned_to. Returns title, description, status, priority, due_date, assigned_to, client_id.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done'] },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          overdue_only: { type: 'boolean', description: 'If true, only return tasks with due_date in the past that are not done' },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_financial_record',
      description: 'Insert or update a financial record. Can add expenses, payments, or investments. ALWAYS confirm with the user before executing.',
      parameters: {
        type: 'object',
        properties: {
          record_type: { type: 'string', enum: ['expense', 'payment', 'investment'] },
          expense: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              amount: { type: 'number' },
              expense_month: { type: 'number' },
              expense_year: { type: 'number' },
              notes: { type: 'string' },
            },
            required: ['type', 'amount', 'expense_month', 'expense_year'],
            additionalProperties: false,
          },
          payment: {
            type: 'object',
            properties: {
              client_id: { type: 'string' },
              amount: { type: 'number' },
              payment_month: { type: 'number' },
              payment_year: { type: 'number' },
              notes: { type: 'string' },
            },
            required: ['client_id', 'amount', 'payment_month', 'payment_year'],
            additionalProperties: false,
          },
          investment: {
            type: 'object',
            properties: {
              owner_name: { type: 'string' },
              amount: { type: 'number' },
              investment_date: { type: 'string' },
              notes: { type: 'string' },
            },
            required: ['owner_name', 'amount'],
            additionalProperties: false,
          },
        },
        required: ['record_type'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Create a new task. ALWAYS confirm with the user before executing.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done'] },
          due_date: { type: 'string', description: 'ISO date string (YYYY-MM-DD)' },
          client_id: { type: 'string', description: 'Optional client ID to associate the task with' },
        },
        required: ['title'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_message',
      description: 'Send a message to a client in the messaging system. ALWAYS confirm with the user before executing.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string', description: 'The client ID to send the message to' },
          content: { type: 'string', description: 'The message content' },
        },
        required: ['client_id', 'content'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_client_email',
      description: 'Send a transactional email to a client. ALWAYS confirm with the user before executing.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string', description: 'The client ID to email' },
          subject: { type: 'string' },
          body_html: { type: 'string', description: 'HTML email body' },
          body_text: { type: 'string', description: 'Plain text fallback' },
        },
        required: ['client_id', 'subject', 'body_html'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_reminder',
      description: 'Create a notification/reminder for the admin. Useful for scheduling follow-ups.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          link: { type: 'string', description: 'Optional link path (e.g. /admin/clients)' },
        },
        required: ['title'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_overdue_summary',
      description: 'Get a summary of overdue/stale items: overdue tasks, unpaid balances, stale projects (no update in 14+ days).',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_recent_activity',
      description: 'Get the admin\'s recent activity log — actions they\'ve taken across the platform (creating clients, updating projects, sending messages, etc.). Useful for context about what the admin has been working on.',
      parameters: {
        type: 'object',
        properties: {
          entity_type: { type: 'string', description: 'Optional filter: client, project, task, expense, investment, overhead, message, asset' },
          limit: { type: 'number', description: 'Number of recent activities to return (default 20, max 50)' },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
]

const SYSTEM_PROMPT = `You are an AI assistant for Vektiss, a digital agency. You help the admin manage clients, projects, finances, and tasks.

You have access to tools that let you query and modify the agency's data. Use them to answer questions accurately.

Guidelines:
- Be concise but thorough. Use markdown formatting.
- When asked about a client, query their data first before answering.
- For ANY write/mutating action (creating tasks, sending messages, updating financials, sending emails), ALWAYS describe what you're about to do and ask for confirmation BEFORE executing. Only proceed after the user confirms.
- When analyzing financials, calculate totals, trends, and provide actionable insights.
- Proactively mention overdue items or potential issues you notice.
- Format currency as USD (e.g., $1,500).
- Today's date is ${new Date().toISOString().split('T')[0]}.
- When listing data, use tables or bullet points for readability.
- If you don't have enough info to complete a request, ask clarifying questions.`

async function executeTool(supabase: ReturnType<typeof createClient>, name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'query_clients': {
      let query = supabase.from('clients').select('*')
      if (args.name) query = query.ilike('name', `%${args.name}%`)
      if (args.status) query = query.eq('status', args.status)
      const { data, error } = await query.order('name')
      if (error) return { error: error.message }
      return { clients: data, count: data?.length ?? 0 }
    }
    case 'query_projects': {
      let query = supabase.from('projects').select('*, clients(name)')
      if (args.client_id) query = query.eq('client_id', args.client_id)
      if (args.status) query = query.eq('status', args.status)
      const { data, error } = await query.order('created_at', { ascending: false })
      if (error) return { error: error.message }
      return { projects: data, count: data?.length ?? 0 }
    }
    case 'query_financials': {
      const results: Record<string, unknown> = {}

      // Payments
      let payQ = supabase.from('client_payments').select('*, clients(name)')
      if (args.client_id) payQ = payQ.eq('client_id', args.client_id)
      if (args.year) payQ = payQ.eq('payment_year', args.year)
      if (args.month) payQ = payQ.eq('payment_month', args.month)
      const { data: payments } = await payQ.neq('notes', 'Projected').order('payment_year', { ascending: false })
      results.payments = payments

      // Expenses
      let expQ = supabase.from('expenses').select('*')
      if (args.year) expQ = expQ.eq('expense_year', args.year)
      if (args.month) expQ = expQ.eq('expense_month', args.month)
      const { data: expenses } = await expQ.order('expense_year', { ascending: false })
      results.expenses = expenses

      // Investments
      const { data: investments } = await supabase.from('investments').select('*')
      results.investments = investments

      // Client costs
      if (args.client_id) {
        const { data: costs } = await supabase.from('client_costs').select('*').eq('client_id', args.client_id)
        results.client_costs = costs
      }

      // Business overhead
      const { data: overhead } = await supabase.from('business_overhead').select('*')
      results.overhead = overhead

      // Summary
      const totalRevenue = (payments ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0)
      const totalExpenses = (expenses ?? []).reduce((s: number, e: { amount: number }) => s + Number(e.amount), 0)
      results.summary = { total_revenue: totalRevenue, total_expenses: totalExpenses, net_profit: totalRevenue - totalExpenses }

      return results
    }
    case 'query_tasks': {
      let query = supabase.from('tasks').select('*, clients(name)')
      if (args.status) query = query.eq('status', args.status)
      if (args.priority) query = query.eq('priority', args.priority)
      if (args.overdue_only) {
        query = query.lt('due_date', new Date().toISOString().split('T')[0]).neq('status', 'done')
      }
      const { data, error } = await query.order('due_date', { ascending: true })
      if (error) return { error: error.message }
      return { tasks: data, count: data?.length ?? 0 }
    }
    case 'update_financial_record': {
      const rt = args.record_type as string
      if (rt === 'expense') {
        const exp = args.expense as Record<string, unknown>
        const { data, error } = await supabase.from('expenses').insert({
          type: exp.type,
          amount: exp.amount,
          expense_month: exp.expense_month,
          expense_year: exp.expense_year,
          notes: exp.notes || null,
        }).select()
        if (error) return { error: error.message }
        return { success: true, record: data?.[0] }
      }
      if (rt === 'payment') {
        const pay = args.payment as Record<string, unknown>
        const { data, error } = await supabase.from('client_payments').insert({
          client_id: pay.client_id,
          amount: pay.amount,
          payment_month: pay.payment_month,
          payment_year: pay.payment_year,
          notes: pay.notes || null,
        }).select()
        if (error) return { error: error.message }
        return { success: true, record: data?.[0] }
      }
      if (rt === 'investment') {
        const inv = args.investment as Record<string, unknown>
        const { data, error } = await supabase.from('investments').insert({
          owner_name: inv.owner_name,
          amount: inv.amount,
          investment_date: inv.investment_date || null,
          notes: inv.notes || null,
        }).select()
        if (error) return { error: error.message }
        return { success: true, record: data?.[0] }
      }
      return { error: 'Invalid record_type' }
    }
    case 'create_task': {
      const { data, error } = await supabase.from('tasks').insert({
        title: args.title,
        description: args.description || null,
        priority: args.priority || 'medium',
        status: args.status || 'todo',
        due_date: args.due_date || null,
        client_id: args.client_id || null,
      }).select()
      if (error) return { error: error.message }
      return { success: true, task: data?.[0] }
    }
    case 'send_message': {
      // Get admin user IDs to use as sender
      const { data: adminRoles } = await supabase.from('user_roles').select('user_id').eq('role', 'admin').limit(1)
      const senderId = adminRoles?.[0]?.user_id
      if (!senderId) return { error: 'No admin user found' }

      const { data, error } = await supabase.from('messages').insert({
        client_id: args.client_id,
        sender_id: senderId,
        content: args.content,
      }).select()
      if (error) return { error: error.message }
      return { success: true, message: data?.[0] }
    }
    case 'send_client_email': {
      const { data: client } = await supabase.from('clients').select('email, name').eq('id', args.client_id).single()
      if (!client?.email) return { error: 'Client has no email address' }

      const { data, error } = await supabase.rpc('enqueue_email', {
        queue_name: 'transactional_emails',
        payload: {
          to: client.email,
          from: 'Vektiss <noreply@mail.vektiss.com>',
          sender_domain: 'mail.vektiss.com',
          subject: args.subject,
          html: args.body_html,
          text: args.body_text || '',
          label: 'ai_agent_email',
          message_id: crypto.randomUUID(),
          queued_at: new Date().toISOString(),
        },
      })
      if (error) return { error: error.message }
      return { success: true, sent_to: client.email, queue_id: data }
    }
    case 'create_reminder': {
      // Get admin user IDs
      const { data: adminRoles } = await supabase.from('user_roles').select('user_id').eq('role', 'admin').limit(1)
      const userId = adminRoles?.[0]?.user_id
      if (!userId) return { error: 'No admin user found' }

      const { data, error } = await supabase.from('notifications').insert({
        user_id: userId,
        title: args.title,
        body: args.body || null,
        type: 'reminder',
        link: args.link || null,
      }).select()
      if (error) return { error: error.message }
      return { success: true, notification: data?.[0] }
    }
    case 'get_overdue_summary': {
      const today = new Date().toISOString().split('T')[0]

      // Overdue tasks
      const { data: overdueTasks } = await supabase.from('tasks').select('*, clients(name)')
        .lt('due_date', today).neq('status', 'done').order('due_date')

      // Clients with balance due
      const { data: unpaidClients } = await supabase.from('clients').select('id, name, balance_due, email')
        .gt('balance_due', 0).order('balance_due', { ascending: false })

      // Stale projects (no update in 14+ days, still in progress)
      const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString()
      const { data: staleProjects } = await supabase.from('projects').select('*, clients(name)')
        .eq('status', 'in_progress').lt('updated_at', twoWeeksAgo)

      return {
        overdue_tasks: { items: overdueTasks ?? [], count: overdueTasks?.length ?? 0 },
        unpaid_balances: { items: unpaidClients ?? [], count: unpaidClients?.length ?? 0 },
        stale_projects: { items: staleProjects ?? [], count: staleProjects?.length ?? 0 },
      }
    }
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: 'AI is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token)
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = claimsData.claims.sub as string

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceKey)
    const { data: roleData } = await adminClient.from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').single()
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { messages } = await req.json()

    // Build messages for AI
    const aiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ]

    // Tool calling loop - keep calling AI until no more tool calls
    let maxIterations = 10
    while (maxIterations-- > 0) {
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: aiMessages,
          tools: TOOLS,
          tool_choice: 'auto',
          stream: false,
        }),
      })

      if (!aiResponse.ok) {
        const status = aiResponse.status
        const text = await aiResponse.text()
        console.error('AI gateway error:', status, text)
        if (status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add funds.' }), {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ error: 'AI service error' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const aiData = await aiResponse.json()
      const choice = aiData.choices?.[0]

      if (!choice) {
        return new Response(JSON.stringify({ error: 'No response from AI' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const assistantMessage = choice.message

      // If no tool calls, return the final response
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        return new Response(JSON.stringify({
          content: assistantMessage.content || '',
          tool_calls_made: aiMessages.filter((m: { role: string }) => m.role === 'tool').length,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Process tool calls
      aiMessages.push(assistantMessage)

      for (const toolCall of assistantMessage.tool_calls) {
        const fnName = toolCall.function.name
        let fnArgs: Record<string, unknown> = {}
        try {
          fnArgs = JSON.parse(toolCall.function.arguments || '{}')
        } catch {
          fnArgs = {}
        }

        console.log(`Executing tool: ${fnName}`, fnArgs)
        const result = await executeTool(adminClient, fnName, fnArgs)

        aiMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        })
      }
    }

    return new Response(JSON.stringify({ error: 'Too many tool call iterations' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('ai-agent error:', e)
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
