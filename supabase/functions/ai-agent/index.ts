import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// ─── Tool definitions per role ───────────────────────────────────────────────

const SHARED_TOOLS = {
  query_projects: {
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
  query_tasks: {
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
  query_project_attachments: {
    type: 'function',
    function: {
      name: 'query_project_attachments',
      description: 'Get documents and links attached to a project. Returns title, type (link or file), url, file_name, file_size, and created_at.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Project ID to get attachments for' },
        },
        required: ['project_id'],
        additionalProperties: false,
      },
    },
  },
}

const ADMIN_ONLY_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_clients',
      description: 'Search or list clients. Can filter by name, status, or get all clients with their details.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Optional client name to search for (partial match)' },
          status: { type: 'string', enum: ['active', 'onboarding', 'closed', 'prospect', 'lead'] },
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
      description: 'Get financial data: payments, expenses, investments, client costs, and business overhead.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' },
          year: { type: 'number' },
          month: { type: 'number' },
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
      description: 'Insert a financial record (expense, payment, or investment). ALWAYS confirm before executing.',
      parameters: {
        type: 'object',
        properties: {
          record_type: { type: 'string', enum: ['expense', 'payment', 'investment'] },
          expense: {
            type: 'object',
            properties: {
              type: { type: 'string' }, amount: { type: 'number' },
              expense_month: { type: 'number' }, expense_year: { type: 'number' }, notes: { type: 'string' },
            },
            required: ['type', 'amount', 'expense_month', 'expense_year'], additionalProperties: false,
          },
          payment: {
            type: 'object',
            properties: {
              client_id: { type: 'string' }, amount: { type: 'number' },
              payment_month: { type: 'number' }, payment_year: { type: 'number' }, notes: { type: 'string' },
            },
            required: ['client_id', 'amount', 'payment_month', 'payment_year'], additionalProperties: false,
          },
          investment: {
            type: 'object',
            properties: {
              owner_name: { type: 'string' }, amount: { type: 'number' },
              investment_date: { type: 'string' }, notes: { type: 'string' },
            },
            required: ['owner_name', 'amount'], additionalProperties: false,
          },
        },
        required: ['record_type'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Create a new task. ALWAYS confirm before executing.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' }, description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done'] },
          due_date: { type: 'string' }, client_id: { type: 'string' },
        },
        required: ['title'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_message',
      description: 'Send a message to a client. ALWAYS confirm before executing.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' }, content: { type: 'string' },
        },
        required: ['client_id', 'content'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_client_email',
      description: 'Send a transactional email to a client. ALWAYS confirm before executing.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' }, subject: { type: 'string' },
          body_html: { type: 'string' }, body_text: { type: 'string' },
        },
        required: ['client_id', 'subject', 'body_html'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_reminder',
      description: 'Create a notification/reminder for the admin.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' }, body: { type: 'string' }, link: { type: 'string' },
        },
        required: ['title'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_overdue_summary',
      description: 'Get overdue tasks, unpaid balances, and stale projects.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_recent_activity',
      description: 'Get the admin\'s recent activity log.',
      parameters: {
        type: 'object',
        properties: {
          entity_type: { type: 'string' }, limit: { type: 'number' },
        },
        required: [], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_client_notes',
      description: 'Get knowledge base entries for a client.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' },
          type: { type: 'string', enum: ['meeting', 'document', 'action_item', 'note'] },
          limit: { type: 'number' },
        },
        required: ['client_id'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_company_summaries',
      description: 'Get company-wide client status reports / summaries. These are periodic reports containing the current state of all clients, pipeline, and action items. Use this when asked about client updates, company snapshots, or what is happening across the business.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of summaries to return (default 3, most recent first)' },
          search: { type: 'string', description: 'Optional keyword to search in title or content' },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_sops',
      description: 'Search SOPs (Standard Operating Procedures). Use this when asked about processes, workflows, policies, how things should be done, or operational questions. Can filter by category or search by keyword.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['onboarding', 'operations', 'development', 'design', 'communication', 'finance', 'general'] },
          search: { type: 'string', description: 'Keyword to search in title or content' },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
]

const OPS_ONLY_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_clients',
      description: 'Search or list clients (read-only). Can filter by name or status.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          status: { type: 'string', enum: ['active', 'onboarding', 'closed', 'prospect', 'lead'] },
        },
        required: [], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Create a new task. ALWAYS confirm before executing.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' }, description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done'] },
          due_date: { type: 'string' }, client_id: { type: 'string' },
        },
        required: ['title'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task_status',
      description: 'Update the status of an existing task. ALWAYS confirm before executing.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string' },
          status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done'] },
        },
        required: ['task_id', 'status'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_time_entries',
      description: 'Get timesheet entries. Can filter by date range or user_id.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          start_date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
          end_date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
        },
        required: [], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_sops',
      description: 'Search SOPs (Standard Operating Procedures). Can filter by category or search by keyword.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['onboarding', 'operations', 'development', 'design', 'communication', 'finance', 'general'] },
          search: { type: 'string', description: 'Keyword to search in title or content' },
        },
        required: [], additionalProperties: false,
      },
    },
  },
]

const CLIENT_ONLY_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_my_projects',
      description: 'Get your projects with status, phase, and progress details.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_my_payments',
      description: 'Get your payment history.',
      parameters: {
        type: 'object',
        properties: {
          year: { type: 'number' },
        },
        required: [], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_my_assets',
      description: 'Get your uploaded assets/files.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_message_to_team',
      description: 'Send a message to your Vektiss team. ALWAYS confirm before executing.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string' },
        },
        required: ['content'], additionalProperties: false,
      },
    },
  },
]

function getToolsForRole(role: string) {
  if (role === 'admin') {
    return [SHARED_TOOLS.query_projects, SHARED_TOOLS.query_tasks, SHARED_TOOLS.query_project_attachments, ...ADMIN_ONLY_TOOLS]
  }
  if (role === 'ops') {
    return [SHARED_TOOLS.query_projects, SHARED_TOOLS.query_tasks, SHARED_TOOLS.query_project_attachments, ...OPS_ONLY_TOOLS]
  }
  return [...CLIENT_ONLY_TOOLS, SHARED_TOOLS.query_project_attachments]
}

function getSystemPrompt(role: string) {
  const today = new Date().toISOString().split('T')[0]

  if (role === 'admin') {
    return `You are an AI assistant for Vektiss, a digital agency. You help the admin manage clients, projects, finances, and tasks.

You have access to tools that let you query and modify the agency's data. Use them to answer questions accurately.

You also have access to the admin's activity log — a record of every action they take on the platform. Use query_recent_activity to understand context.

You can query project attachments (documents and links) using query_project_attachments to see what files and references are attached to any project.

You can access company-wide client status reports using query_company_summaries. These reports contain the latest state of all clients, pipeline status, and action items. Use this tool when asked about what's happening across the business, client updates, company snapshots, or any broad operational question.

You can search SOPs (Standard Operating Procedures) using query_sops. These contain documented processes, policies, and workflows for the team. Reference them when asked about how things should be done, operational procedures, or team policies.

Guidelines:
- Be concise but thorough. Use markdown formatting.
- When asked about a client, query their data first. Also check company summaries for the latest status notes.
- For ANY write/mutating action, ALWAYS describe what you're about to do and ask for confirmation BEFORE executing.
- When analyzing financials, calculate totals, trends, and provide actionable insights.
- Proactively mention overdue items or potential issues.
- Format currency as USD (e.g., $1,500).
- Today's date is ${today}.
- Use tables or bullet points for readability.
- If you don't have enough info, ask clarifying questions.`
  }

  if (role === 'ops') {
    return `You are an AI assistant for the Vektiss operations team. You help ops team members manage their tasks, track time, reference SOPs, and stay on top of project work.

You have access to tools that let you query tasks, projects, clients (read-only), timesheets, and SOPs. You can also create tasks and update task statuses.

You can query project attachments (documents and links) using query_project_attachments to see what files and references are attached to any project.

Guidelines:
- Be concise and action-oriented. Use markdown formatting.
- Help with task prioritization and workload management.
- Reference relevant SOPs when team members ask "how to" questions.
- For ANY write/mutating action (creating tasks, updating statuses), ALWAYS confirm before executing.
- Today's date is ${today}.
- Use tables or bullet points for readability.
- If you don't have enough info, ask clarifying questions.
- You cannot modify financials or client records — direct those requests to an admin.`
  }

  // Client
  return `You are an AI assistant for Vektiss, a digital agency. You help clients stay informed about their projects, payments, and assets.

You can look up your project status, payment history, uploaded assets, and send messages to the Vektiss team.

You can also query documents and links attached to your projects using query_project_attachments.

Guidelines:
- Be friendly, professional, and helpful. Use markdown formatting.
- When asked about project status, query their data first.
- For sending messages, ALWAYS confirm the content before executing.
- Today's date is ${today}.
- Format currency as USD (e.g., $1,500).
- If you can't help with something, suggest the client reach out to their Vektiss team directly.
- Keep responses clear and jargon-free.`
}

// ─── Tool execution ──────────────────────────────────────────────────────────

async function executeTool(
  supabase: ReturnType<typeof createClient>,
  name: string,
  args: Record<string, unknown>,
  context: { role: string; userId: string; clientId?: string }
) {
  switch (name) {
    // ─── Shared / Admin tools ────────────────────────────────────────
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
    case 'query_project_attachments': {
      const projectId = args.project_id as string
      // For clients, verify they own this project
      if (context.role === 'client' && context.clientId) {
        const { data: proj } = await supabase.from('projects').select('id').eq('id', projectId).eq('client_id', context.clientId).single()
        if (!proj) return { error: 'Project not found or access denied.' }
      }
      const { data, error } = await supabase.from('project_attachments')
        .select('id, title, type, url, file_name, file_size, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      if (error) return { error: error.message }
      // Generate download URLs for file attachments
      const enriched = await Promise.all((data ?? []).map(async (att: any) => {
        if (att.type === 'file') {
          const { data: fileData } = await supabase.from('project_attachments')
            .select('file_path').eq('id', att.id).single()
          if (fileData?.file_path) {
            const { data: signed } = await supabase.storage
              .from('client-assets')
              .createSignedUrl(fileData.file_path, 3600)
            if (signed?.signedUrl) att.download_url = signed.signedUrl
          }
        }
        return att
      }))
      return { attachments: enriched, count: enriched.length }
    }
    case 'query_financials': {
      const results: Record<string, unknown> = {}
      let payQ = supabase.from('client_payments').select('*, clients(name)')
      if (args.client_id) payQ = payQ.eq('client_id', args.client_id)
      if (args.year) payQ = payQ.eq('payment_year', args.year)
      if (args.month) payQ = payQ.eq('payment_month', args.month)
      const { data: payments } = await payQ.neq('notes', 'Projected').order('payment_year', { ascending: false })
      results.payments = payments

      let expQ = supabase.from('expenses').select('*')
      if (args.year) expQ = expQ.eq('expense_year', args.year)
      if (args.month) expQ = expQ.eq('expense_month', args.month)
      const { data: expenses } = await expQ.order('expense_year', { ascending: false })
      results.expenses = expenses

      const { data: investments } = await supabase.from('investments').select('*')
      results.investments = investments

      if (args.client_id) {
        const { data: costs } = await supabase.from('client_costs').select('*').eq('client_id', args.client_id)
        results.client_costs = costs
      }

      const { data: overhead } = await supabase.from('business_overhead').select('*')
      results.overhead = overhead

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
          type: exp.type, amount: exp.amount, expense_month: exp.expense_month, expense_year: exp.expense_year, notes: exp.notes || null,
        }).select()
        if (error) return { error: error.message }
        return { success: true, record: data?.[0] }
      }
      if (rt === 'payment') {
        const pay = args.payment as Record<string, unknown>
        const { data, error } = await supabase.from('client_payments').insert({
          client_id: pay.client_id, amount: pay.amount, payment_month: pay.payment_month, payment_year: pay.payment_year, notes: pay.notes || null,
        }).select()
        if (error) return { error: error.message }
        return { success: true, record: data?.[0] }
      }
      if (rt === 'investment') {
        const inv = args.investment as Record<string, unknown>
        const { data, error } = await supabase.from('investments').insert({
          owner_name: inv.owner_name, amount: inv.amount, investment_date: inv.investment_date || null, notes: inv.notes || null,
        }).select()
        if (error) return { error: error.message }
        return { success: true, record: data?.[0] }
      }
      return { error: 'Invalid record_type' }
    }
    case 'create_task': {
      const { data, error } = await supabase.from('tasks').insert({
        title: args.title, description: args.description || null,
        priority: args.priority || 'medium', status: args.status || 'todo',
        due_date: args.due_date || null, client_id: args.client_id || null,
      }).select()
      if (error) return { error: error.message }
      return { success: true, task: data?.[0] }
    }
    case 'update_task_status': {
      const { data, error } = await supabase.from('tasks')
        .update({ status: args.status })
        .eq('id', args.task_id as string)
        .select()
      if (error) return { error: error.message }
      return { success: true, task: data?.[0] }
    }
    case 'send_message': {
      // Use the authenticated user's ID as sender, not an arbitrary admin
      const senderId = context.userId
      if (!senderId) return { error: 'No authenticated user' }
      const { data, error } = await supabase.from('messages').insert({
        client_id: args.client_id, sender_id: senderId, content: args.content,
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
          to: client.email, from: 'Vektiss <noreply@mail.vektiss.com>', sender_domain: 'mail.vektiss.com',
          subject: args.subject, html: args.body_html, text: args.body_text || '',
          label: 'ai_agent_email', message_id: crypto.randomUUID(), queued_at: new Date().toISOString(),
        },
      })
      if (error) return { error: error.message }
      return { success: true, sent_to: client.email, queue_id: data }
    }
    case 'create_reminder': {
      const targetUserId = context.userId
      const { data, error } = await supabase.from('notifications').insert({
        user_id: targetUserId, title: args.title, body: args.body || null, type: 'reminder', link: args.link || null,
      }).select()
      if (error) return { error: error.message }
      return { success: true, notification: data?.[0] }
    }
    case 'get_overdue_summary': {
      const today = new Date().toISOString().split('T')[0]
      const { data: overdueTasks } = await supabase.from('tasks').select('*, clients(name)')
        .lt('due_date', today).neq('status', 'done').order('due_date')
      const { data: unpaidClients } = await supabase.from('clients').select('id, name, balance_due, email')
        .gt('balance_due', 0).order('balance_due', { ascending: false })
      const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString()
      const { data: staleProjects } = await supabase.from('projects').select('*, clients(name)')
        .eq('status', 'in_progress').lt('updated_at', twoWeeksAgo)
      return {
        overdue_tasks: { items: overdueTasks ?? [], count: overdueTasks?.length ?? 0 },
        unpaid_balances: { items: unpaidClients ?? [], count: unpaidClients?.length ?? 0 },
        stale_projects: { items: staleProjects ?? [], count: staleProjects?.length ?? 0 },
      }
    }
    case 'query_company_summaries': {
      const limit = Math.min(Number(args.limit) || 3, 10)
      let query = supabase.from('company_summaries').select('id, title, content, summary_date, created_at')
        .order('summary_date', { ascending: false }).limit(limit)
      if (args.search) query = query.or(`title.ilike.%${args.search}%,content.ilike.%${args.search}%`)
      const { data, error } = await query
      if (error) return { error: error.message }
      return { summaries: data ?? [], count: data?.length ?? 0 }
    }
    case 'query_recent_activity': {
      const limit = Math.min(Number(args.limit) || 20, 50)
      let query = supabase.from('admin_activity_log').select('*')
        .order('created_at', { ascending: false }).limit(limit)
      if (args.entity_type) query = query.eq('entity_type', args.entity_type as string)
      const { data, error } = await query
      if (error) return { error: error.message }
      return { activities: data ?? [], count: data?.length ?? 0 }
    }
    case 'query_client_notes': {
      const limit = Math.min(Number(args.limit) || 20, 50)
      let query = supabase.from('client_notes').select('*')
        .eq('client_id', args.client_id as string)
        .order('created_at', { ascending: false }).limit(limit)
      if (args.type) query = query.eq('type', args.type as string)
      const { data, error } = await query
      if (error) return { error: error.message }
      return { notes: data ?? [], count: data?.length ?? 0 }
    }

    // ─── Ops-specific tools ──────────────────────────────────────────
    case 'query_time_entries': {
      let query = supabase.from('time_entries').select('*')
      if (args.user_id) query = query.eq('user_id', args.user_id)
      if (args.start_date) query = query.gte('entry_date', args.start_date)
      if (args.end_date) query = query.lte('entry_date', args.end_date)
      const { data, error } = await query.order('entry_date', { ascending: false }).limit(100)
      if (error) return { error: error.message }
      const totalHours = (data ?? []).reduce((s: number, e: { hours: number }) => s + Number(e.hours), 0)
      return { entries: data ?? [], count: data?.length ?? 0, total_hours: totalHours }
    }
    case 'query_sops': {
      let query = supabase.from('sops').select('*')
      if (args.category) query = query.eq('category', args.category)
      if (args.search) query = query.or(`title.ilike.%${args.search}%,content.ilike.%${args.search}%`)
      const { data, error } = await query.order('updated_at', { ascending: false })
      if (error) return { error: error.message }
      return { sops: data ?? [], count: data?.length ?? 0 }
    }

    // ─── Client-specific tools ───────────────────────────────────────
    case 'query_my_projects': {
      if (!context.clientId) return { error: 'No client profile found for your account.' }
      const { data, error } = await supabase.from('projects').select('*')
        .eq('client_id', context.clientId).order('updated_at', { ascending: false })
      if (error) return { error: error.message }
      return { projects: data ?? [], count: data?.length ?? 0 }
    }
    case 'query_my_payments': {
      if (!context.clientId) return { error: 'No client profile found for your account.' }
      let query = supabase.from('client_payments').select('*')
        .eq('client_id', context.clientId).neq('notes', 'Projected')
      if (args.year) query = query.eq('payment_year', args.year)
      const { data, error } = await query.order('payment_year', { ascending: false })
      if (error) return { error: error.message }
      const total = (data ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0)
      return { payments: data ?? [], count: data?.length ?? 0, total_paid: total }
    }
    case 'query_my_assets': {
      if (!context.clientId) return { error: 'No client profile found for your account.' }
      const { data, error } = await supabase.from('assets').select('*')
        .eq('client_id', context.clientId).order('created_at', { ascending: false })
      if (error) return { error: error.message }
      return { assets: data ?? [], count: data?.length ?? 0 }
    }
    case 'send_message_to_team': {
      if (!context.clientId) return { error: 'No client profile found for your account.' }
      const { data, error } = await supabase.from('messages').insert({
        client_id: context.clientId, sender_id: context.userId, content: args.content,
      }).select()
      if (error) return { error: error.message }
      return { success: true, message: data?.[0] }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token)
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = claimsData.claims.sub as string
    const adminClient = createClient(supabaseUrl, serviceKey)

    // Determine role
    const { data: roleData } = await adminClient.from('user_roles').select('role').eq('user_id', userId).single()
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'No role found for user' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userRole = roleData.role as string

    // For client role, get their client_id
    let clientId: string | undefined
    if (userRole === 'client') {
      const { data } = await adminClient.from('clients').select('id').eq('user_id', userId).single()
      clientId = data?.id
    }

    const { messages } = await req.json()

    const tools = getToolsForRole(userRole)
    const systemPrompt = getSystemPrompt(userRole)
    const context = { role: userRole, userId, clientId }

    const aiMessages: any[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ]

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY is not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let maxIterations = 10
    while (maxIterations-- > 0) {
      const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: aiMessages,
          tools,
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
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add funds.' }), {
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ error: 'AI service error' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const aiData = await aiResponse.json()
      const choice = aiData.choices?.[0]

      if (!choice) {
        return new Response(JSON.stringify({ error: 'No response from AI' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const assistantMessage = choice.message

      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        return new Response(JSON.stringify({
          content: assistantMessage.content || '',
          tool_calls_made: aiMessages.filter((m: { role: string }) => m.role === 'tool').length,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      aiMessages.push(assistantMessage)

      for (const toolCall of assistantMessage.tool_calls) {
        const fnName = toolCall.function.name
        let fnArgs: Record<string, unknown> = {}
        try { fnArgs = JSON.parse(toolCall.function.arguments || '{}') } catch { fnArgs = {} }

        console.log(`[${userRole}] Executing tool: ${fnName}`, fnArgs)
        const result = await executeTool(adminClient, fnName, fnArgs, context)

        aiMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        })
      }
    }

    return new Response(JSON.stringify({ error: 'Too many tool call iterations' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('ai-agent error:', e)
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
