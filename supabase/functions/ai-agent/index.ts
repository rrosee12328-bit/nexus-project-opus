import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// ─── Risk levels ─────────────────────────────────────────────────────────────
type RiskLevel = 'low' | 'medium' | 'high'

const TOOL_RISK: Record<string, RiskLevel> = {
  // Low-risk: auto-approved (read, summaries, notes, tags, recommendations)
  query_projects: 'low', query_tasks: 'low', query_clients: 'low',
  query_financials: 'low', query_project_attachments: 'low',
  query_time_entries: 'low', query_sops: 'low', query_company_summaries: 'low',
  query_recent_activity: 'low', query_client_notes: 'low',
  query_calls: 'low',
  query_my_projects: 'low', query_my_payments: 'low', query_my_assets: 'low',
  query_my_calls: 'low',
  query_approval_requests: 'low', query_project_phases: 'low',
  query_team_members: 'low', query_calendar_events: 'low',
  query_messages: 'low', query_onboarding_steps: 'low',
  get_overdue_summary: 'low',
  query_client_profitability: 'low', query_time_vs_revenue: 'low',
  create_reminder: 'low',
  create_client_note: 'low',
  generate_project_summary: 'low',
  flag_project_risk: 'low',

  // Medium-risk: AI should confirm with user before executing
  create_task: 'medium', update_task: 'medium', assign_task: 'medium',
  update_task_status: 'medium', move_project_stage: 'medium',
  create_follow_up_task: 'medium', bulk_update_tasks: 'medium',
  create_calendar_event: 'medium', update_project: 'medium',
  create_approval_request: 'medium',

  // High-risk: AI must never auto-execute
  send_message: 'medium', send_message_to_team: 'medium',
  send_client_email: 'high', update_financial_record: 'high',
  update_client: 'high',
}

// ─── Tool definitions ────────────────────────────────────────────────────────

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
        required: [], additionalProperties: false,
      },
    },
  },
  query_tasks: {
    type: 'function',
    function: {
      name: 'query_tasks',
      description: 'Get tasks, optionally filtered by status, priority, assigned_to, or client_id. Returns title, description, status, priority, due_date, assigned_to, client_id.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done'] },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          client_id: { type: 'string', description: 'Filter tasks by client' },
          assigned_to: { type: 'string', description: 'Filter tasks by assignee user ID' },
          overdue_only: { type: 'boolean', description: 'If true, only return tasks with due_date in the past that are not done' },
        },
        required: [], additionalProperties: false,
      },
    },
  },
  query_project_attachments: {
    type: 'function',
    function: {
      name: 'query_project_attachments',
      description: 'Get documents and links attached to a project.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Project ID to get attachments for' },
        },
        required: ['project_id'], additionalProperties: false,
      },
    },
  },
}

const ADMIN_ONLY_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_clients',
      description: 'Search or list clients. Can filter by name, status, or get all clients.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Partial name match' },
          status: { type: 'string', enum: ['active', 'onboarding', 'closed', 'prospect', 'lead'] },
        },
        required: [], additionalProperties: false,
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
        required: [], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_team_members',
      description: 'Get list of team members (admin/ops roles) with their names and IDs. Useful for task assignment.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_project_phases',
      description: 'Get all phases for a project with their status, notes, and completion dates.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
        },
        required: ['project_id'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_approval_requests',
      description: 'Get approval requests, optionally filtered by client, project, or status.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' },
          project_id: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
        },
        required: [], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_calendar_events',
      description: 'Get calendar events, optionally filtered by date range or client.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' },
          start_date: { type: 'string', description: 'ISO date YYYY-MM-DD' },
          end_date: { type: 'string', description: 'ISO date YYYY-MM-DD' },
        },
        required: [], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_messages',
      description: 'Get messages for a client thread, optionally only unread.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' },
          unread_only: { type: 'boolean' },
          limit: { type: 'number' },
        },
        required: [], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_onboarding_steps',
      description: 'Get onboarding checklist steps for a client.',
      parameters: {
        type: 'object',
        properties: { client_id: { type: 'string' } },
        required: ['client_id'], additionalProperties: false,
      },
    },
  },
  // ─── Action tools ─────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Create a new task. MEDIUM RISK — confirm with user before executing.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' }, description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done'] },
          due_date: { type: 'string' }, client_id: { type: 'string' },
          assigned_to: { type: 'string', description: 'User ID to assign the task to' },
        },
        required: ['title'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Update an existing task (status, priority, due_date, description, assigned_to). MEDIUM RISK — confirm before executing.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string' },
          status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done'] },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          due_date: { type: 'string' },
          description: { type: 'string' },
          assigned_to: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['task_id'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'assign_task',
      description: 'Assign a task to a team member. Use query_team_members first to get user IDs. MEDIUM RISK.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string' },
          user_id: { type: 'string', description: 'The user ID to assign the task to' },
        },
        required: ['task_id', 'user_id'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bulk_update_tasks',
      description: 'Update multiple tasks at once with the same changes. MEDIUM RISK — confirm before executing. Returns summary of what changed.',
      parameters: {
        type: 'object',
        properties: {
          task_ids: { type: 'array', items: { type: 'string' }, description: 'Array of task IDs to update' },
          updates: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done'] },
              priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
              assigned_to: { type: 'string' },
              due_date: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
        required: ['task_ids', 'updates'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_follow_up_task',
      description: 'Create a follow-up task linked to a project. Automatically sets client_id from the project. MEDIUM RISK.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          due_date: { type: 'string' },
          assigned_to: { type: 'string' },
        },
        required: ['project_id', 'title'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_project_stage',
      description: 'Move a project to a new phase/stage. Valid phases: discovery, design, development, review, launch, deploy. MEDIUM RISK — confirm before executing.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          new_phase: { type: 'string', enum: ['discovery', 'design', 'development', 'review', 'launch', 'deploy'] },
        },
        required: ['project_id', 'new_phase'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_project',
      description: 'Update project fields like status, progress, description, dates. MEDIUM RISK.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          status: { type: 'string', enum: ['not_started', 'in_progress', 'completed', 'on_hold'] },
          progress: { type: 'number', description: '0-100' },
          description: { type: 'string' },
          target_date: { type: 'string' },
        },
        required: ['project_id'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_client_note',
      description: 'Create a note, meeting note, action item, or document reference for a client. LOW RISK — auto-approved.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' },
          title: { type: 'string' },
          content: { type: 'string' },
          type: { type: 'string', enum: ['note', 'meeting', 'action_item', 'document'] },
        },
        required: ['client_id', 'title', 'content'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_project_summary',
      description: 'Generate a comprehensive project summary by fetching project data, phases, tasks, activity log, and approval status. Returns all data for you to compose a summary. LOW RISK.',
      parameters: {
        type: 'object',
        properties: { project_id: { type: 'string' } },
        required: ['project_id'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'flag_project_risk',
      description: 'Flag a project as at-risk by creating a notification for all admins with the risk reason. LOW RISK.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          reason: { type: 'string', description: 'Why this project is at risk' },
        },
        required: ['project_id', 'reason'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_approval_request',
      description: 'Create a client approval request for a deliverable. MEDIUM RISK.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          client_id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          phase: { type: 'string' },
        },
        required: ['project_id', 'client_id', 'title'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_calendar_event',
      description: 'Create a calendar event. MEDIUM RISK.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          event_date: { type: 'string', description: 'YYYY-MM-DD' },
          start_time: { type: 'string', description: 'HH:MM (24h)' },
          end_time: { type: 'string', description: 'HH:MM (24h)' },
          event_type: { type: 'string', enum: ['meeting', 'deadline', 'reminder', 'call', 'internal'] },
          description: { type: 'string' },
          client_id: { type: 'string' },
        },
        required: ['title', 'event_date'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_client',
      description: 'Update client record fields. HIGH RISK — always confirm before executing.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' },
          notes: { type: 'string' },
          last_contact_date: { type: 'string' },
          status: { type: 'string', enum: ['active', 'onboarding', 'closed', 'prospect', 'lead'] },
        },
        required: ['client_id'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_message',
      description: 'Send a message to a client. MEDIUM RISK — confirm content before executing.',
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
      description: 'Send a transactional email to a client. HIGH RISK — always confirm before executing.',
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
      name: 'update_financial_record',
      description: 'Insert a financial record (expense, payment, or investment). HIGH RISK — always confirm before executing.',
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
      name: 'create_reminder',
      description: 'Create a notification/reminder for the admin. LOW RISK.',
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
      description: 'Get overdue tasks, unpaid balances, stale projects, and pending approvals. LOW RISK.',
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
      description: 'Get company-wide client status reports / summaries.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number' },
          search: { type: 'string' },
        },
        required: [], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_sops',
      description: 'Search SOPs (Standard Operating Procedures).',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['onboarding', 'operations', 'development', 'design', 'communication', 'finance', 'general'] },
          search: { type: 'string' },
        },
        required: [], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_calls',
      description: 'Search recorded calls (Fathom call intelligence) for summaries, key decisions, sentiment, and transcripts. Use this whenever the user asks about a meeting, call, what was said, what was agreed/decided, sentiment, or anything discussed verbally. Internal team meetings are linked to the Vektiss internal client.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string', description: 'Filter to calls for a specific client (use Vektiss internal client id for internal meetings).' },
          call_type: { type: 'string', enum: ['discovery', 'check_in', 'kickoff', 'review', 'planning', 'sales', 'support', 'other'] },
          search: { type: 'string', description: 'Free-text search across summary, transcript, and key decisions.' },
          since_days: { type: 'number', description: 'Only return calls within the last N days.' },
          limit: { type: 'number', description: 'Max calls to return (default 10, max 25).' },
          include_transcript: { type: 'boolean', description: 'If true, include the full transcript (large). Defaults to false — summary + key decisions only.' },
        },
        required: [], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_client_profitability',
      description: 'Get TRUE profitability per client including internal labor cost (hours × internal hourly rate from business_settings) plus external client_costs. This is the source-of-truth for "is this client actually profitable?" questions. Returns revenue, hours, labor_cost, external_cost, profit, and margin_pct per month.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string', description: 'Filter to one client.' },
          months_back: { type: 'number', description: 'How many months of history to return (default 3, max 12).' },
          unprofitable_only: { type: 'boolean', description: 'If true, only return clients with negative profit or margin below the low-margin threshold.' },
        },
        required: [], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_time_vs_revenue',
      description: 'Compare hours logged on a client (or all clients) against revenue collected over a period. Surfaces clients consuming far more time than they pay for. Use this for "are we spending too much time on X" questions.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' },
          since_days: { type: 'number', description: 'Lookback window in days (default 30).' },
        },
        required: [], additionalProperties: false,
      },
    },
  },
]

const OPS_ONLY_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_clients',
      description: 'Search or list clients (read-only).',
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
      description: 'Create a new task. MEDIUM RISK — confirm before executing.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' }, description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done'] },
          due_date: { type: 'string' }, client_id: { type: 'string' },
          assigned_to: { type: 'string' },
        },
        required: ['title'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Update an existing task. MEDIUM RISK — confirm before executing.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string' },
          status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done'] },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          due_date: { type: 'string' },
          description: { type: 'string' },
          assigned_to: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['task_id'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task_status',
      description: 'Update the status of an existing task. MEDIUM RISK.',
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
      name: 'query_team_members',
      description: 'Get list of team members for task assignment.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_time_entries',
      description: 'Get timesheet entries.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
        },
        required: [], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_sops',
      description: 'Search SOPs.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['onboarding', 'operations', 'development', 'design', 'communication', 'finance', 'general'] },
          search: { type: 'string' },
        },
        required: [], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_calls',
      description: 'Search recorded calls (Fathom call intelligence) for summaries, key decisions, sentiment, and transcripts. Use this whenever the user asks about a meeting, call, what was said, or what was decided.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' },
          call_type: { type: 'string', enum: ['discovery', 'check_in', 'kickoff', 'review', 'planning', 'sales', 'support', 'other'] },
          search: { type: 'string' },
          since_days: { type: 'number' },
          limit: { type: 'number' },
          include_transcript: { type: 'boolean' },
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
        properties: { year: { type: 'number' } },
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
      name: 'query_my_calls',
      description: 'Get summaries and key decisions from your own calls/meetings with the Vektiss team. Use this when the client asks "what did we discuss?" or "what did you say about X?". Only returns calls where the client was present.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Free-text search across the meeting summary.' },
          since_days: { type: 'number', description: 'Only return calls within the last N days.' },
          limit: { type: 'number', description: 'Max calls to return (default 5, max 15).' },
        },
        required: [], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_message_to_team',
      description: 'Send a message to your Vektiss team. Confirm before executing.',
      parameters: {
        type: 'object',
        properties: { content: { type: 'string' } },
        required: ['content'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_approval_requests',
      description: 'View your pending approval requests.',
      parameters: {
        type: 'object',
        properties: { status: { type: 'string', enum: ['pending', 'approved', 'rejected'] } },
        required: [], additionalProperties: false,
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

// ─── System prompts ──────────────────────────────────────────────────────────

function getSystemPrompt(role: string, sessionContext?: { page?: string; entityType?: string; entityId?: string; entityName?: string }) {
  const today = new Date().toISOString().split('T')[0]
  const contextBlock = sessionContext?.entityName
    ? `\n\nSESSION CONTEXT: The user is currently viewing the ${sessionContext.page || 'portal'} page. ${sessionContext.entityType ? `They are looking at ${sessionContext.entityType}: "${sessionContext.entityName}"${sessionContext.entityId ? ` (ID: ${sessionContext.entityId})` : ''}.` : ''} When the user says "this client", "this project", "this task", etc., they mean the entity in context.`
    : ''

  if (role === 'admin') {
    return `You are Vektiss AI — an operational action agent embedded inside the Vektiss business portal. You are NOT a generic chatbot. You have REAL tools that can query data and make changes to the portal.

CRITICAL RULES:
- You MUST use your tools for EVERY request. NEVER say "I can't do that" or "I don't have access." You DO have access.
- If a user asks you to do something, USE YOUR TOOLS to do it. Do not give generic advice.
- If a user asks about calendar, tasks, projects, clients, or any portal data — QUERY it with your tools first, then answer.
- If a user asks you to create, update, move, or change something — USE the appropriate action tool.
- NEVER suggest manual workarounds when you have a tool that can do it.
- NEVER say "I apologize" and then list generic steps. TAKE ACTION instead.

You operate in 3 modes:
1. **INFORMATION MODE**: Query data, answer questions, generate summaries — ALWAYS use query tools
2. **RECOMMENDATION MODE**: Analyze portal data with tools, identify issues, suggest concrete next steps
3. **ACTION MODE**: Execute approved backend operations through your tools

## Risk Levels
- **LOW RISK** (auto-approved): queries, summaries, internal notes, reminders, risk flags
- **MEDIUM RISK** (describe what you'll do, then execute): task creation/updates, assignments, stage changes, calendar events, project updates
- **HIGH RISK** (explain impact, ask for explicit yes/no): financial changes, client status changes, sending emails

## Workflow Intelligence
- **Overdue**: tasks past due_date that aren't done
- **Blocked**: projects with no task activity in 14+ days
- **At-risk**: clients with overdue payments + stale projects + no recent communication
- **Valid stage transitions**: discovery → design → development → review → launch → deploy

## True Profitability (NEW)
- Internal labor costs $125/hour by default (configurable in business_settings).
- For ANY question like "is X profitable", "are we making money on Y", "should we keep this client", "are we spending too much time on Z" — ALWAYS call query_client_profitability or query_time_vs_revenue first. Do NOT answer from gut feel.
- query_client_profitability includes labor cost (hours × internal rate) plus client_costs. Negative profit = we are losing money on that client this month.
- When you see a client with negative or sub-threshold margin, proactively suggest: raise the rate, cap hours, renegotiate scope, or offboard.

## Action Result Format
After every action, report:
- ✅ What was changed
- ⏭️ What was skipped (and why)
- ⚠️ What needs approval
- ❌ What failed (and why)

## Guidelines
- Be concise. Use markdown formatting, tables, and bullet points.
- Format currency as USD (e.g., $1,500).
- Today's date is ${today}.
- Reference SOPs, company summaries, and call recordings for institutional knowledge. When the user mentions a meeting, call, what was said/agreed/decided, or sentiment about a client — ALWAYS call query_calls first.
- Fathom call summaries occasionally mishear dollar amounts (e.g. "twelve fifty" → "$12.50" when it should be "$1,250"). If query_calls returns a row with summary_edited=true, trust that summary. If flagged_amounts is non-empty, warn the user that the original Fathom value was likely wrong and prefer the corrected one.
- If you need more context to complete an action, ask — but NEVER refuse to act when you have the tools.${contextBlock}`
  }

  if (role === 'ops') {
    return `You are Vektiss AI — an operations assistant for the Vektiss ops team. You have REAL tools to query and modify portal data.

CRITICAL: You MUST use your tools for every request. NEVER say "I can't do that." If asked to do something, USE your tools. Never give generic advice when you have tools to take action.

You operate in 3 modes:
1. **INFORMATION MODE**: Query tasks, projects, timesheets, SOPs — ALWAYS use query tools
2. **RECOMMENDATION MODE**: Suggest task prioritization, identify blockers, optimize workload — use data from tools
3. **ACTION MODE**: Create/update tasks, change statuses

## Risk Levels
- **LOW RISK** (auto): queries, SOPs, summaries
- **MEDIUM RISK** (describe then execute): task creation, status updates, assignments

After every action, report what changed, what was skipped, and what failed.
- Be concise and action-oriented. Use markdown.
- Today's date is ${today}.
- When the user asks about a meeting, call, what was said or decided, use query_calls.
- You cannot modify financials or client records.${contextBlock}`
  }

  // Client
  return `You are the Vektiss client assistant. You help THIS client — and only this client — track their project, payments, assets, approvals, and what was discussed on their calls with Vektiss.

## What you can do
- Look up their project status, phase, progress, payments, uploaded assets, and pending approvals.
- Summarize what was discussed on their own meetings with Vektiss using query_my_calls.
- Send messages to their Vektiss team (always confirm content first).

## STRICT BOUNDARIES — never violate these
- NEVER reference, name, compare to, or discuss any other client, project, or company. If asked about other clients, politely decline and offer to help with their own work.
- NEVER share Vektiss internal information: pricing strategy, profit margins, internal team chats, SOPs, business overhead, expenses, investments, hourly rates we charge, or operational notes.
- NEVER share contents of internal Vektiss meetings (strategy/planning calls without the client present). query_my_calls only returns meetings the client was on — trust it.
- NEVER speculate about what Vektiss might be doing behind the scenes. If you don't know, say "I'd need to check with the team" and offer to send a message.
- NEVER reveal team member names, emails, internal task assignments, or staffing details beyond "your Vektiss team".
- NEVER discuss other clients' work or examples even if asked for "a similar project we've done".
- If the client asks about money beyond their own invoices and project total, redirect them to billing@vektiss.com.
- Stay focused on THEIR project and what was discussed with THEM. If something is unclear, ask them or offer to message the team.

## Style
- Be warm, clear, and concise. Use markdown.
- Format currency as USD.
- Today's date is ${today}.
- For sending messages, ALWAYS confirm content before sending.
- If a request falls outside the boundaries above, decline kindly and offer to send a message to their team.${contextBlock}`
}

// ─── Audit logging ───────────────────────────────────────────────────────────

async function logAIAction(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  toolName: string,
  args: Record<string, unknown>,
  result: Record<string, unknown>,
  riskLevel: RiskLevel,
) {
  try {
    const isWrite = riskLevel !== 'low' || ['create_client_note', 'create_reminder', 'flag_project_risk'].includes(toolName)
    if (!isWrite) return // Don't log pure reads

    await supabase.from('admin_activity_log').insert({
      user_id: userId,
      action: `ai_action:${toolName}`,
      entity_type: 'ai_agent',
      entity_id: (args.project_id || args.client_id || args.task_id || null) as string | null,
      summary: `AI Agent executed ${toolName} [${riskLevel} risk]${result.error ? ' — FAILED' : result.success ? ' — SUCCESS' : ''}`,
      metadata: {
        tool: toolName,
        risk_level: riskLevel,
        args: args,
        success: !!result.success,
        error: result.error || null,
      },
    })
  } catch (err) {
    console.error('AI audit log error:', err)
  }
}

// ─── Tool execution ──────────────────────────────────────────────────────────

async function executeTool(
  supabase: ReturnType<typeof createClient>,
  name: string,
  args: Record<string, unknown>,
  context: { role: string; userId: string; clientId?: string }
) {
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
    case 'query_project_attachments': {
      const projectId = args.project_id as string
      if (context.role === 'client' && context.clientId) {
        const { data: proj } = await supabase.from('projects').select('id').eq('id', projectId).eq('client_id', context.clientId).single()
        if (!proj) return { error: 'Project not found or access denied.' }
      }
      const { data, error } = await supabase.from('project_attachments')
        .select('id, title, type, url, file_name, file_size, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      if (error) return { error: error.message }
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
      if (args.client_id) query = query.eq('client_id', args.client_id)
      if (args.assigned_to) query = query.eq('assigned_to', args.assigned_to)
      if (args.overdue_only) {
        query = query.lt('due_date', new Date().toISOString().split('T')[0]).neq('status', 'done')
      }
      query = query.is('archived_at', null)
      const { data, error } = await query.order('due_date', { ascending: true }).limit(200)
      if (error) return { error: error.message }
      return { tasks: data, count: data?.length ?? 0 }
    }
    case 'query_team_members': {
      const { data: roles } = await supabase.from('user_roles').select('user_id, role').in('role', ['admin', 'ops'])
      if (!roles?.length) return { team: [], count: 0 }
      const userIds = roles.map((r: any) => r.user_id)
      const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', userIds)
      const team = roles.map((r: any) => {
        const p = (profiles ?? []).find((p: any) => p.user_id === r.user_id)
        return { user_id: r.user_id, role: r.role, display_name: p?.display_name || 'Unknown' }
      })
      return { team, count: team.length }
    }
    case 'query_project_phases': {
      const { data, error } = await supabase.from('project_phases').select('*')
        .eq('project_id', args.project_id as string).order('sort_order')
      if (error) return { error: error.message }
      return { phases: data, count: data?.length ?? 0 }
    }
    case 'query_approval_requests': {
      let query = supabase.from('approval_requests').select('*, clients(name), projects(name)')
      if (args.client_id) query = query.eq('client_id', args.client_id)
      if (args.project_id) query = query.eq('project_id', args.project_id)
      if (args.status) query = query.eq('status', args.status)
      if (context.role === 'client' && context.clientId) {
        query = query.eq('client_id', context.clientId)
      }
      const { data, error } = await query.order('created_at', { ascending: false }).limit(50)
      if (error) return { error: error.message }
      return { approvals: data, count: data?.length ?? 0 }
    }
    case 'query_calendar_events': {
      let query = supabase.from('calendar_events').select('*, clients(name)')
      if (args.client_id) query = query.eq('client_id', args.client_id)
      if (args.start_date) query = query.gte('event_date', args.start_date)
      if (args.end_date) query = query.lte('event_date', args.end_date)
      const { data, error } = await query.order('event_date').limit(100)
      if (error) return { error: error.message }
      return { events: data, count: data?.length ?? 0 }
    }
    case 'query_messages': {
      let query = supabase.from('messages').select('*, clients(name)')
      if (args.client_id) query = query.eq('client_id', args.client_id)
      if (args.unread_only) query = query.is('read_at', null)
      const limit = Math.min(Number(args.limit) || 50, 200)
      const { data, error } = await query.order('created_at', { ascending: false }).limit(limit)
      if (error) return { error: error.message }
      return { messages: data, count: data?.length ?? 0 }
    }
    case 'query_onboarding_steps': {
      const { data, error } = await supabase.from('client_onboarding_steps').select('*')
        .eq('client_id', args.client_id as string).order('sort_order')
      if (error) return { error: error.message }
      const completed = (data ?? []).filter((s: any) => s.completed_at).length
      return { steps: data, count: data?.length ?? 0, completed, remaining: (data?.length ?? 0) - completed }
    }

    // ─── Action tools ──────────────────────────────────────────────────
    case 'create_task': {
      const { data, error } = await supabase.from('tasks').insert({
        title: args.title, description: args.description || null,
        priority: args.priority || 'medium', status: args.status || 'todo',
        due_date: args.due_date || null, client_id: args.client_id || null,
        assigned_to: args.assigned_to || null,
      }).select()
      if (error) return { error: error.message }
      return { success: true, task: data?.[0], action_summary: `Created task: "${args.title}"` }
    }
    case 'update_task': {
      const updates: Record<string, unknown> = {}
      if (args.status !== undefined) updates.status = args.status
      if (args.priority !== undefined) updates.priority = args.priority
      if (args.due_date !== undefined) updates.due_date = args.due_date
      if (args.description !== undefined) updates.description = args.description
      if (args.assigned_to !== undefined) updates.assigned_to = args.assigned_to
      if (args.title !== undefined) updates.title = args.title
      if (Object.keys(updates).length === 0) return { error: 'No updates provided' }
      const { data, error } = await supabase.from('tasks')
        .update(updates).eq('id', args.task_id as string).select()
      if (error) return { error: error.message }
      return { success: true, task: data?.[0], action_summary: `Updated task ${args.task_id}: ${Object.keys(updates).join(', ')}` }
    }
    case 'update_task_status': {
      const { data, error } = await supabase.from('tasks')
        .update({ status: args.status }).eq('id', args.task_id as string).select()
      if (error) return { error: error.message }
      return { success: true, task: data?.[0], action_summary: `Task status → ${args.status}` }
    }
    case 'assign_task': {
      const { data, error } = await supabase.from('tasks')
        .update({ assigned_to: args.user_id }).eq('id', args.task_id as string).select()
      if (error) return { error: error.message }
      return { success: true, task: data?.[0], action_summary: `Task assigned to user ${args.user_id}` }
    }
    case 'bulk_update_tasks': {
      const taskIds = args.task_ids as string[]
      const updates = args.updates as Record<string, unknown>
      const results = { updated: [] as string[], failed: [] as { id: string; error: string }[] }
      for (const id of taskIds) {
        const { error } = await supabase.from('tasks').update(updates).eq('id', id)
        if (error) results.failed.push({ id, error: error.message })
        else results.updated.push(id)
      }
      return {
        success: results.failed.length === 0,
        action_summary: `Bulk update: ${results.updated.length} updated, ${results.failed.length} failed`,
        ...results,
      }
    }
    case 'create_follow_up_task': {
      const { data: proj } = await supabase.from('projects').select('client_id, name').eq('id', args.project_id as string).single()
      if (!proj) return { error: 'Project not found' }
      const { data, error } = await supabase.from('tasks').insert({
        title: args.title, description: args.description || `Follow-up for project: ${proj.name}`,
        priority: args.priority || 'medium', status: 'todo',
        due_date: args.due_date || null, client_id: proj.client_id,
        assigned_to: args.assigned_to || null,
      }).select()
      if (error) return { error: error.message }
      return { success: true, task: data?.[0], action_summary: `Follow-up task created for project "${proj.name}"` }
    }
    case 'move_project_stage': {
      const validPhases = ['discovery', 'design', 'development', 'review', 'launch', 'deploy']
      const newPhase = args.new_phase as string
      if (!validPhases.includes(newPhase)) return { error: `Invalid phase: ${newPhase}` }
      // Update project current_phase
      const { data: proj, error: projErr } = await supabase.from('projects')
        .update({ current_phase: newPhase }).eq('id', args.project_id as string).select().single()
      if (projErr) return { error: projErr.message }
      // Also update phase records: mark new phase as in_progress
      await supabase.from('project_phases')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('project_id', args.project_id as string).eq('phase', newPhase)
      return { success: true, project: proj, action_summary: `Project moved to ${newPhase} phase` }
    }
    case 'update_project': {
      const updates: Record<string, unknown> = {}
      if (args.status !== undefined) updates.status = args.status
      if (args.progress !== undefined) updates.progress = args.progress
      if (args.description !== undefined) updates.description = args.description
      if (args.target_date !== undefined) updates.target_date = args.target_date
      if (Object.keys(updates).length === 0) return { error: 'No updates provided' }
      const { data, error } = await supabase.from('projects')
        .update(updates).eq('id', args.project_id as string).select().single()
      if (error) return { error: error.message }
      return { success: true, project: data, action_summary: `Project updated: ${Object.keys(updates).join(', ')}` }
    }
    case 'create_client_note': {
      const { data, error } = await supabase.from('client_notes').insert({
        client_id: args.client_id, title: args.title, content: args.content,
        type: args.type || 'note', created_by: context.userId,
      }).select()
      if (error) return { error: error.message }
      return { success: true, note: data?.[0], action_summary: `Note created: "${args.title}"` }
    }
    case 'generate_project_summary': {
      const pid = args.project_id as string
      const [projRes, phasesRes, tasksRes, activityRes, approvalsRes] = await Promise.all([
        supabase.from('projects').select('*, clients(name)').eq('id', pid).single(),
        supabase.from('project_phases').select('*').eq('project_id', pid).order('sort_order'),
        supabase.from('tasks').select('*').eq('client_id', (await supabase.from('projects').select('client_id').eq('id', pid).single()).data?.client_id || '').is('archived_at', null),
        supabase.from('project_activity_log').select('*').eq('project_id', pid).order('created_at', { ascending: false }).limit(20),
        supabase.from('approval_requests').select('*').eq('project_id', pid).order('created_at', { ascending: false }),
      ])
      return {
        project: projRes.data,
        phases: phasesRes.data,
        tasks: { all: tasksRes.data, count: tasksRes.data?.length ?? 0, done: (tasksRes.data ?? []).filter((t: any) => t.status === 'done').length },
        recent_activity: activityRes.data,
        approvals: approvalsRes.data,
      }
    }
    case 'flag_project_risk': {
      const { data: proj } = await supabase.from('projects').select('name, clients(name)').eq('id', args.project_id as string).single()
      const projectName = (proj as any)?.name || 'Unknown'
      // Notify all admins
      const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin')
      const notifications = (admins ?? []).map((a: any) => ({
        user_id: a.user_id,
        title: `⚠️ At-Risk: ${projectName}`,
        body: args.reason as string,
        type: 'risk',
        link: '/admin/projects',
      }))
      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications)
      }
      return { success: true, action_summary: `Risk flag raised for "${projectName}" — ${notifications.length} admin(s) notified` }
    }
    case 'create_approval_request': {
      const { data, error } = await supabase.from('approval_requests').insert({
        project_id: args.project_id, client_id: args.client_id,
        title: args.title, description: args.description || null,
        phase: args.phase || null, submitted_by: context.userId,
      }).select()
      if (error) return { error: error.message }
      return { success: true, approval: data?.[0], action_summary: `Approval request created: "${args.title}"` }
    }
    case 'create_calendar_event': {
      const { data, error } = await supabase.from('calendar_events').insert({
        title: args.title, event_date: args.event_date,
        start_time: args.start_time || null, end_time: args.end_time || null,
        event_type: args.event_type || 'meeting', description: args.description || null,
        client_id: args.client_id || null, created_by: context.userId,
      }).select()
      if (error) return { error: error.message }
      return { success: true, event: data?.[0], action_summary: `Calendar event created: "${args.title}" on ${args.event_date}` }
    }
    case 'update_client': {
      const updates: Record<string, unknown> = {}
      if (args.notes !== undefined) updates.notes = args.notes
      if (args.last_contact_date !== undefined) updates.last_contact_date = args.last_contact_date
      if (args.status !== undefined) updates.status = args.status
      if (Object.keys(updates).length === 0) return { error: 'No updates provided' }
      const { data, error } = await supabase.from('clients')
        .update(updates).eq('id', args.client_id as string).select().single()
      if (error) return { error: error.message }
      return { success: true, client: data, action_summary: `Client updated: ${Object.keys(updates).join(', ')}` }
    }
    case 'update_financial_record': {
      const rt = args.record_type as string
      if (rt === 'expense') {
        const exp = args.expense as Record<string, unknown>
        const { data, error } = await supabase.from('expenses').insert({
          type: exp.type, amount: exp.amount, expense_month: exp.expense_month, expense_year: exp.expense_year, notes: exp.notes || null,
        }).select()
        if (error) return { error: error.message }
        return { success: true, record: data?.[0], action_summary: `Expense recorded: $${exp.amount}` }
      }
      if (rt === 'payment') {
        const pay = args.payment as Record<string, unknown>
        const { data, error } = await supabase.from('client_payments').insert({
          client_id: pay.client_id, amount: pay.amount, payment_month: pay.payment_month, payment_year: pay.payment_year, notes: pay.notes || null,
        }).select()
        if (error) return { error: error.message }
        return { success: true, record: data?.[0], action_summary: `Payment recorded: $${pay.amount}` }
      }
      if (rt === 'investment') {
        const inv = args.investment as Record<string, unknown>
        const { data, error } = await supabase.from('investments').insert({
          owner_name: inv.owner_name, amount: inv.amount, investment_date: inv.investment_date || null, notes: inv.notes || null,
        }).select()
        if (error) return { error: error.message }
        return { success: true, record: data?.[0], action_summary: `Investment recorded: $${inv.amount}` }
      }
      return { error: 'Invalid record_type' }
    }
    case 'send_message': {
      const { data, error } = await supabase.from('messages').insert({
        client_id: args.client_id, sender_id: context.userId, content: args.content,
      }).select()
      if (error) return { error: error.message }
      return { success: true, message: data?.[0], action_summary: `Message sent to client` }
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
      return { success: true, sent_to: client.email, queue_id: data, action_summary: `Email queued to ${client.email}` }
    }
    case 'create_reminder': {
      const { data, error } = await supabase.from('notifications').insert({
        user_id: context.userId, title: args.title, body: args.body || null, type: 'reminder', link: args.link || null,
      }).select()
      if (error) return { error: error.message }
      return { success: true, notification: data?.[0], action_summary: `Reminder created: "${args.title}"` }
    }
    case 'get_overdue_summary': {
      const today = new Date().toISOString().split('T')[0]
      const [overdueTasks, unpaidClients, staleProjects, pendingApprovals] = await Promise.all([
        supabase.from('tasks').select('*, clients(name)')
          .lt('due_date', today).neq('status', 'done').is('archived_at', null).order('due_date'),
        supabase.from('clients').select('id, name, balance_due, email')
          .gt('balance_due', 0).order('balance_due', { ascending: false }),
        supabase.from('projects').select('*, clients(name)')
          .eq('status', 'in_progress').lt('updated_at', new Date(Date.now() - 14 * 86400000).toISOString()),
        supabase.from('approval_requests').select('*, clients(name), projects(name)')
          .eq('status', 'pending'),
      ])
      return {
        overdue_tasks: { items: overdueTasks.data ?? [], count: overdueTasks.data?.length ?? 0 },
        unpaid_balances: { items: unpaidClients.data ?? [], count: unpaidClients.data?.length ?? 0 },
        stale_projects: { items: staleProjects.data ?? [], count: staleProjects.data?.length ?? 0 },
        pending_approvals: { items: pendingApprovals.data ?? [], count: pendingApprovals.data?.length ?? 0 },
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
    case 'query_sops': {
      let query = supabase.from('sops').select('*')
      if (args.category) query = query.eq('category', args.category)
      if (args.search) query = query.or(`title.ilike.%${args.search}%,content.ilike.%${args.search}%`)
      const { data, error } = await query.order('updated_at', { ascending: false })
      if (error) return { error: error.message }
      return { sops: data ?? [], count: data?.length ?? 0 }
    }
    case 'query_calls': {
      const limit = Math.min(Number(args.limit) || 10, 25)
      const includeTranscript = args.include_transcript === true
      const cols = includeTranscript
        ? 'id, call_date, call_type, client_id, project_id, summary, key_decisions, sentiment, duration_minutes, fathom_url, transcript, summary_edited, flagged_amounts'
        : 'id, call_date, call_type, client_id, project_id, summary, key_decisions, sentiment, duration_minutes, fathom_url, summary_edited, flagged_amounts'
      let query = supabase.from('call_intelligence').select(cols)
        .order('call_date', { ascending: false }).limit(limit)
      if (args.client_id) query = query.eq('client_id', args.client_id as string)
      if (args.call_type) query = query.eq('call_type', args.call_type as string)
      if (args.since_days) {
        const since = new Date(Date.now() - Number(args.since_days) * 86400000).toISOString()
        query = query.gte('call_date', since)
      }
      if (args.search) {
        const s = String(args.search).replace(/[%,]/g, ' ')
        query = query.or(`summary.ilike.%${s}%,transcript.ilike.%${s}%`)
      }
      const { data, error } = await query
      if (error) return { error: error.message }
      return {
        calls: data ?? [],
        count: data?.length ?? 0,
        note: 'Summaries come from Fathom\'s AI. If `flagged_amounts` is non-empty, those dollar values may have been misheard during transcription — prefer `summary_edited=true` rows as authoritative.',
      }
    }

    // ─── Ops ────────────────────────────────────────────────────────────
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

    // ─── Client ─────────────────────────────────────────────────────────
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
    case 'query_my_calls': {
      if (!context.clientId) return { error: 'No client profile found for your account.' }
      const limit = Math.min(Number(args.limit) || 5, 15)
      // Hard-pinned to the authenticated client's id. Transcripts are NEVER returned to clients.
      let query = supabase.from('call_intelligence')
        .select('id, call_date, call_type, summary, key_decisions, sentiment, duration_minutes, summary_edited')
        .eq('client_id', context.clientId)
        .order('call_date', { ascending: false })
        .limit(limit)
      if (args.since_days) {
        const since = new Date(Date.now() - Number(args.since_days) * 86400000).toISOString()
        query = query.gte('call_date', since)
      }
      if (args.search) {
        const s = String(args.search).replace(/[%,]/g, ' ')
        query = query.ilike('summary', `%${s}%`)
      }
      const { data, error } = await query
      if (error) return { error: error.message }
      return {
        calls: data ?? [],
        count: data?.length ?? 0,
        note: 'Only meetings where the client was present. Internal Vektiss strategy calls are excluded.',
      }
    }
    case 'send_message_to_team': {
      if (!context.clientId) return { error: 'No client profile found for your account.' }
      const { data, error } = await supabase.from('messages').insert({
        client_id: context.clientId, sender_id: context.userId, content: args.content,
      }).select()
      if (error) return { error: error.message }
      return { success: true, message: data?.[0], action_summary: 'Message sent to your team' }
    }

    case 'query_client_profitability': {
      const monthsBack = Math.min(Math.max(Number(args.months_back ?? 3), 1), 12)
      const cutoff = new Date()
      cutoff.setMonth(cutoff.getMonth() - (monthsBack - 1))
      cutoff.setDate(1)
      const cutoffStr = cutoff.toISOString().split('T')[0]

      let query = supabase.from('v_client_profitability').select('*').gte('month_start', cutoffStr)
      if (args.client_id) query = query.eq('client_id', args.client_id)
      const { data, error } = await query.order('month_start', { ascending: false }).limit(500)
      if (error) return { error: error.message }

      let rows = data ?? []
      if (args.unprofitable_only) {
        const { data: settings } = await supabase.from('business_settings').select('low_margin_threshold_pct').limit(1).maybeSingle()
        const threshold = Number(settings?.low_margin_threshold_pct ?? 20)
        rows = rows.filter((r: any) => r.revenue > 0 && (r.profit < 0 || (r.margin_pct !== null && Number(r.margin_pct) < threshold)))
      }
      return { rows, count: rows.length, months_back: monthsBack }
    }

    case 'query_time_vs_revenue': {
      const sinceDays = Math.max(Number(args.since_days ?? 30), 1)
      const sinceDate = new Date(Date.now() - sinceDays * 86400000).toISOString().split('T')[0]

      const { data: settings } = await supabase.from('business_settings').select('internal_hourly_cost').limit(1).maybeSingle()
      const rate = Number(settings?.internal_hourly_cost ?? 125)

      let teQ = supabase.from('time_entries').select('client_id, hours').gte('entry_date', sinceDate)
      if (args.client_id) teQ = teQ.eq('client_id', args.client_id)
      const { data: te } = await teQ

      const sinceIso = new Date(Date.now() - sinceDays * 86400000).toISOString()
      let payQ = supabase.from('client_payments').select('client_id, amount, created_at').gte('created_at', sinceIso).neq('notes', 'Projected')
      if (args.client_id) payQ = payQ.eq('client_id', args.client_id)
      const { data: pay } = await payQ

      const { data: clients } = await supabase.from('clients').select('id, name, status').neq('status', 'closed')

      const map = new Map<string, { client_id: string; name: string; hours: number; labor_cost: number; revenue: number }>()
      for (const c of (clients ?? [])) {
        if (args.client_id && c.id !== args.client_id) continue
        map.set(c.id, { client_id: c.id, name: c.name, hours: 0, labor_cost: 0, revenue: 0 })
      }
      for (const t of (te ?? [])) {
        if (!t.client_id) continue
        const row = map.get(t.client_id)
        if (row) { row.hours += Number(t.hours); row.labor_cost = row.hours * rate }
      }
      for (const p of (pay ?? [])) {
        const row = map.get(p.client_id)
        if (row) row.revenue += Number(p.amount)
      }
      const rows = Array.from(map.values())
        .map(r => ({ ...r, net: r.revenue - r.labor_cost, ratio: r.revenue > 0 ? +(r.labor_cost / r.revenue).toFixed(2) : null }))
        .filter(r => r.hours > 0 || r.revenue > 0)
        .sort((a, b) => a.net - b.net)
      return { rows, since_days: sinceDays, internal_hourly_cost: rate, note: 'ratio > 1 means we are spending more in labor than the client paid in this window.' }
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

    const { data: roleData } = await adminClient.from('user_roles').select('role').eq('user_id', userId).single()
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'No role found for user' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userRole = roleData.role as string

    let clientId: string | undefined
    if (userRole === 'client') {
      const { data } = await adminClient.from('clients').select('id').eq('user_id', userId).single()
      clientId = data?.id
    }

    const body = await req.json()
    const { messages, sessionContext } = body

    const tools = getToolsForRole(userRole)
    const systemPrompt = getSystemPrompt(userRole, sessionContext)
    const context = { role: userRole, userId, clientId }

    const aiMessages: any[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ]

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    
    // Use Lovable AI gateway (preferred) or fall back to OpenAI
    const apiUrl = lovableApiKey
      ? 'https://ai.gateway.lovable.dev/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions'
    const apiKey = lovableApiKey || openaiApiKey
    const model = lovableApiKey ? 'google/gemini-3-flash-preview' : 'gpt-4o'

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'No AI API key configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const actionLog: { tool: string; risk: string; result: string }[] = []
    let maxIterations = 10

    while (maxIterations-- > 0) {
      let aiResponse: Response | null = null
      const maxRetries = 3
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        aiResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: aiMessages,
            tools,
            tool_choice: 'auto',
            stream: false,
          }),
        })

        if (aiResponse.ok) break

        const status = aiResponse.status
        const text = await aiResponse.text()
        console.error(`AI API error (attempt ${attempt + 1}/${maxRetries}):`, status, text)

        // Retryable: 503 Service Unavailable, 500 Internal Server Error
        if ((status === 503 || status === 500) && attempt < maxRetries - 1) {
          const delay = 1000 * Math.pow(2, attempt) // 1s, 2s
          console.log(`Retrying in ${delay}ms...`)
          await new Promise(r => setTimeout(r, delay))
          continue
        }

        if (status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add funds in workspace settings.' }), {
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        if (status === 401) {
          return new Response(JSON.stringify({ error: 'Invalid AI API key.' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ error: 'AI service temporarily unavailable. Please try again.' }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (!aiResponse || !aiResponse.ok) {
        return new Response(JSON.stringify({ error: 'AI service temporarily unavailable after retries. Please try again.' }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
          action_log: actionLog.length > 0 ? actionLog : undefined,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      aiMessages.push(assistantMessage)

      for (const toolCall of assistantMessage.tool_calls) {
        const fnName = toolCall.function.name
        let fnArgs: Record<string, unknown> = {}
        try { fnArgs = JSON.parse(toolCall.function.arguments || '{}') } catch { fnArgs = {} }

        const riskLevel = TOOL_RISK[fnName] || 'medium'
        console.log(`[${userRole}] Executing tool: ${fnName} [${riskLevel} risk]`, fnArgs)

        const result = await executeTool(adminClient, fnName, fnArgs, context) as Record<string, unknown>

        // Audit log for write actions
        await logAIAction(adminClient, userId, fnName, fnArgs, result, riskLevel)

        // Track for response
        actionLog.push({
          tool: fnName,
          risk: riskLevel,
          result: result.error ? `❌ ${result.error}` : (result.action_summary as string) || '✅ Success',
        })

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
