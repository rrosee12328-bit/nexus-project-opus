## What we're fixing

The right-side Client Summaries sidebar today just shows whichever `client_notes` row was most recently created — random titles, raw text, no context. You said you wouldn't even open it. We're going to turn it into a rolling, plain-English briefing per client that you'd actually want to glance at every morning.

## What you'll see (the experience)

Open the sidebar and each client is a card that reads like a short status memo a teammate would hand you:

- One-line **headline** — where they stand right now (e.g. "Awaiting KB so we can launch AI Chatbox").
- 2–3 sentence **rolling summary** — what's active, last decision, current vibe, what we owe them or they owe us.
- A small **next step** line — the single most important next action.
- Quiet metadata: `Updated 2h ago · 3 calls · 5 notes · sentiment: positive`
- Status badge + monthly fee chip stay.

Header gets:
- "Refresh all" button (regenerates stale ones in the background)
- Search (already there)
- Sort: "Needs attention" first (stale, negative sentiment, or overdue follow-up), then alphabetical.

Per-card hover reveals: a refresh icon (regenerate just this one) and a "Open client" link.

Empty state per client: "Not enough context yet — add a note or log a call."

## Why this works as a "rolling document"

The summary is **cached in the DB** and **automatically refreshes itself** when something meaningful changes for that client:

- A new call gets analyzed → that client's summary regenerates.
- A new `client_notes` entry is added → summary regenerates.
- A new payment, approval, or phase change → summary regenerates.
- Otherwise nothing happens — it just sits there, accurate, ready for you.

So every time you open the panel, every card already reflects the latest state without you having to think about it. It's the same idea as your Brain Snapshot, but per client.

## Sources the AI reads

For each client, the generator pulls and feeds the model:

1. The client row itself: name, type, status, monthly_fee, billing_model, billing_paused_until, aspirations, current_sentiment, current_status_recap, last_call_headline, last_contact_date, balance_due.
2. All `client_notes` (your seed narrative — Rose's history, Jeremy's Jaylin scope, Greg's outstanding invoice, etc.), most recent first, content trimmed.
3. All `call_intelligence` rows (date, type, summary, key_decisions, sentiment), most recent first.
4. Open `tasks` for that client (so "next step" is grounded, not invented).
5. Latest `approval_requests` and any `phase_milestone_invoices` pending.

The prompt forces: plain English, no markdown bold (per your memory rule), 4 lines max, name a concrete next step, say "not enough context" when thin.

## Technical plan

### 1. New table `client_ai_summaries` (one row per client)

Columns:
- `client_id uuid PK references clients(id) on delete cascade`
- `headline text` — the one-liner
- `summary text` — the 2–3 sentence body
- `next_step text` — single action
- `sentiment text` — pulled through from latest signal
- `notes_count int`, `calls_count int`
- `source_hash text` — fingerprint of inputs so we skip work when nothing changed
- `generated_at timestamptz`, `model text`
- RLS: admin + ops select; service role full access.

### 2. Edge function `generate-client-summary`

- Body: `{ client_id }` or `{ client_ids: [...] }` or `{ all: true, max_age_minutes: 60 }`
- Loads everything in section "Sources" above using service role client.
- Computes `source_hash`. If unchanged → returns cached row (no AI call).
- Calls Lovable AI Gateway, model `google/gemini-3-flash-preview`, with structured tool-calling so we get back `{ headline, summary, next_step, sentiment }` cleanly (no markdown parsing).
- Upserts `client_ai_summaries`.
- Bulk mode iterates 4 at a time.

### 3. Auto-refresh triggers (the "rolling" part)

Postgres triggers + `pg_net` to fire-and-forget the edge function on:
- `INSERT` on `client_notes`
- `INSERT` or `UPDATE of summary, key_decisions` on `call_intelligence`
- `INSERT` on `client_payments` (non-Projected)
- `UPDATE of status, current_phase` on `projects` (resolves to client_id)
- `UPDATE of status` on `approval_requests`

Each trigger calls `net.http_post` to `/functions/v1/generate-client-summary` with `{ client_id }` using the vault-stored service role key (same pattern as `auto_invite_on_first_payment`). Trigger never blocks the original write.

A nightly pg_cron `0 5 * * *` calls the function with `{ all: true, max_age_minutes: 1440 }` so even silent clients get a freshness pass once a day.

### 4. Frontend rewrite of `src/components/ClientSummariesPanel.tsx`

- Single query joins `clients` + `client_ai_summaries` + counts.
- Renders headline / summary / next_step / metadata as described above.
- "Needs attention" sort uses: stale (cache older than newest note/call) OR sentiment in (negative, frustrated) OR `last_contact_date > 14 days ago` for active clients.
- Per-card refresh button → invokes function with `{ client_id }`, optimistic spinner, refetch.
- Header "Refresh all" → invokes with `{ all: true, max_age_minutes: 0 }`, shows toast "Refreshing N clients…".
- Realtime subscription on `client_ai_summaries` so cards update live as the background regen finishes.
- First open auto-fills any client missing a row (batched).

### 5. Memory

New entry: `mem/features/admin/client-summaries-panel.md` — describes the rolling doc, sources, trigger list, and the "no markdown bold" rule already applies.

## Files

- new migration: `client_ai_summaries` table + RLS + the 5 triggers + cron job
- new edge function: `supabase/functions/generate-client-summary/index.ts` (verify_jwt = false, validates service-role caller for trigger paths, validates admin/ops JWT for client-initiated paths)
- edited: `src/components/ClientSummariesPanel.tsx`
- new memory file + index update

## Out of scope (kept separate on purpose)

- The Executive Summary modal on Client Detail (still hits n8n)
- The Latest Briefing card on Client Detail (different purpose: tied to last call)
- Per-client docs on `/admin/summaries`
