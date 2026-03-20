

## Plan: AI Admin Agent with Actions, Analysis, and Proactive Alerts

### What it does

A conversational AI assistant accessible from the admin portal that can:
- **Take actions**: Update financial records, send client emails, create tasks, schedule reminders
- **Analyze data**: Summarize client history, financial health, project performance, opportunities
- **Proactively alert**: Flag overdue tasks, suggest follow-ups, warn about deadlines

### Architecture

```text
┌──────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│  Admin Chat  │────▶│  Edge Function       │────▶│  Lovable AI      │
│  /admin/agent│     │  ai-agent/index.ts   │     │  (Gemini 3 Flash)│
│              │◀────│  + tool execution    │◀────│  + tool calling  │
└──────────────┘     └─────────────────────┘     └──────────────────┘
                              │
                     ┌────────┴────────┐
                     │  Supabase DB    │
                     │  (read/write)   │
                     └─────────────────┘
```

### Changes

**1. Edge function: `supabase/functions/ai-agent/index.ts`**
- Accepts conversation messages from admin
- Verifies admin role via auth
- Defines tools the AI can call:
  - `query_clients` — list/search clients with status, payments, projects
  - `query_financials` — get revenue, expenses, profit summaries
  - `query_projects` — get project status, phases, progress for a client
  - `query_tasks` — get tasks by status, overdue items
  - `update_financial_record` — insert/update expenses, payments
  - `send_client_email` — enqueue a transactional email to a client
  - `create_task` — create a new task with assignee and due date
  - `send_message` — send a message to a client in the messaging system
  - `create_reminder` — insert a notification for the admin at a future time
  - `get_overdue_summary` — check overdue tasks, unpaid invoices, stale projects
- Calls Lovable AI Gateway with streaming + tool_choice: "auto"
- Executes tool calls server-side against Supabase (service role), returns results to the model
- Streams final response back to client

**2. New page: `src/pages/admin/Agent.tsx`**
- Full-screen chat interface with streaming markdown responses
- Shows tool execution status inline (e.g., "Querying client data..." with a spinner)
- Conversation history stored in component state (no DB persistence needed initially)
- Renders AI responses with `react-markdown`

**3. Database: `ai_conversations` table (optional, for history)**
- Migration to create a table for persisting admin-agent conversations
- Columns: id, user_id, messages (jsonb array), created_at, updated_at
- RLS: admins only

**4. Routing and navigation**
- Add `/admin/agent` route in `App.tsx`
- Add "AI Agent" nav item in `AdminSidebar.tsx` with a Bot icon
- Update `supabase/config.toml` with the new function

**5. Install `react-markdown`**
- For rendering AI responses with proper formatting

### How tool calling works

The edge function defines ~10 tools. When the AI decides to use one, the function:
1. Receives the tool call from the AI response
2. Executes the corresponding Supabase query/mutation using service role
3. Sends the result back to the AI as a tool response
4. The AI formulates a natural language answer
5. Streams the final response to the frontend

Example flow: "How's Rose Credit Repair doing?"
→ AI calls `query_clients(name: "Rose Credit Repair")`
→ AI calls `query_projects(client_id: "...")`
→ AI calls `query_financials(client_id: "...")`
→ AI responds: "Rose Credit Repair is an active client since Jan 2026. They have 2 projects..."

### Technical details

- Model: `google/gemini-3-flash-preview` (fast, capable of tool calling)
- Auth: verify_jwt = false, validate admin role in function code
- Streaming: SSE with token-by-token rendering
- Tool execution happens server-side with service_role key — the AI never sees raw SQL
- System prompt includes context about Vektiss as an agency, available data structures, and instructions to be helpful but confirm destructive actions before executing

