

## Global Admin Activity Log + AI Agent Awareness

The goal is to track every action you take across the platform and make that history available to the AI Agent so it knows what you've been doing.

### What gets tracked

All admin actions across the site:
- **Clients**: created, updated, deleted
- **Projects**: created, updated, deleted (extends existing `project_activity_log`)
- **Tasks**: created, updated, status changes, deleted
- **Financials**: payments added/edited, expenses added/edited, investments added/edited, overhead added/edited
- **Messages**: sent to clients
- **Assets**: uploaded, deleted

### Technical approach

#### 1. New `admin_activity_log` table

A single global activity log table:
- `id`, `user_id`, `action` (e.g. "created_client", "updated_task"), `entity_type` (e.g. "client", "task"), `entity_id`, `summary` (human-readable description), `metadata` (jsonb for details), `created_at`
- RLS: admins can read/insert their own activity

#### 2. Client-side logging helper

A small utility function `logActivity(action, entityType, entityId, summary, metadata?)` that inserts into `admin_activity_log`. Called from existing mutation `onSuccess` callbacks across all admin pages:
- `Clients.tsx` — on create/edit/delete
- `Projects.tsx` — on create/edit/delete
- `Tasks.tsx` (ops) — on create/edit/delete/status change
- `Financials.tsx` — on expense/payment/investment/overhead CRUD
- `Messages.tsx` — on message send
- `Assets.tsx` — on upload/delete

#### 3. AI Agent gets a new tool: `query_recent_activity`

Add a tool to the edge function that queries `admin_activity_log` ordered by `created_at DESC`, with optional filters for `entity_type` and limit. This lets the agent answer questions like "What did I do today?" or "What changes were made to Project X?"

#### 4. Update AI system prompt

Add context telling the agent it can check recent admin activity to understand what the user has been working on and provide relevant context.

### Files changed

- **New migration**: Create `admin_activity_log` table with RLS
- **New file** `src/lib/activityLogger.ts`: shared logging utility
- **Edit** `supabase/functions/ai-agent/index.ts`: add `query_recent_activity` tool + system prompt update
- **Edit** multiple admin pages to call `logActivity` in mutation success handlers

