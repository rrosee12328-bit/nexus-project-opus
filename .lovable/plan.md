# Direction: Make the AI the Central Brain of Vektiss

## What you have today (so we don't rebuild it)

- **AI Agent** (`ai-agent` edge function) — 50+ tools across query/action/role-scoped categories. Can read tasks, projects, clients, financials, calls, SOPs, emails, calendar — and write back (create tasks, send messages, update projects).
- **Daily Engine** (`ai-daily-engine`) — runs at 7am, generates briefing + alerts + auto-tasks, posts notifications.
- **Reports** — already calculates client revenue, client costs (`client_costs`), profit, margin per client.
- **Time entries** — tracked per task/project, hours rolled up weekly.
- **Brain Hub** — Mission Control, Market Intelligence, Pulse Feed.

## What's missing (the gap you're describing)

1. **No internal cost-of-labor concept.** The system knows hours logged, but not "1 hour = $125 of our time." So it can't tell you "Goodland paid us $2,400 this month but cost us $3,100 in labor."
2. **AI doesn't see the cost↔revenue↔time triangle.** The agent can query each, but no tool stitches them into a "is this client profitable *right now, this month*" answer.
3. **AI is reactive, not contextual.** It answers when asked. It doesn't say "you spent 14 hours on Steven this week, that's $1,750 of cost against a $1,200 retainer — do you want to flag it?"
4. **Decisions aren't logged as decisions.** Insights are stored as company summaries, but there's no "the AI proposed X, you approved/rejected, here's why" memory loop. So the AI can't learn your preferences.
5. **Context is fragmented.** SOPs, calls, emails, financials all live in different tables. The AI loads them per-query but has no compact, always-on "state of the business" context document.

---

## The Plan — 4 phases, build in order

### Phase 1 — Teach the AI the cost of your time (foundation)

**1.1 Add `internal_hourly_cost` settings**
- New table `business_settings` (single row, key/value): `internal_hourly_cost` (default 125), `target_margin_pct` (default 50), `low_margin_threshold_pct` (default 20).
- Editable from a new "Business Rules" panel in Admin Settings.

**1.2 Add `client_profitability` view (live, not cached)**
A SQL view that joins for each client:
- Revenue this month (from `client_payments`)
- Hours logged this month (from `time_entries` joined via project→client)
- Internal labor cost = hours × `internal_hourly_cost`
- External costs (from `client_costs`)
- True profit = revenue − labor cost − external costs
- Margin %

This becomes the single source of truth the AI queries.

**1.3 Two new AI agent tools**
- `query_client_profitability` — "what's the real margin on Goodland this month / last 90 days / YTD"
- `query_time_vs_revenue` — "how many hours have we spent on X vs what they paid"

### Phase 2 — Make it proactively intelligent

**2.1 Upgrade the Daily Engine context**
Add to the morning context:
- Per-client profitability snapshot (top 3 most profitable, bottom 3 unprofitable)
- "Hours-to-revenue" anomalies (clients consuming >2× their expected hours)
- Decision queue (things the AI thinks need a human call)

**2.2 New "Watcher" cron — runs every 4 hours**
Lighter than the daily engine. Watches for:
- A task just logged 3+ hours and pushed a client into negative margin → alert
- A client hasn't been touched in X days but is actively paying → suggest check-in
- A proposal viewed 3+ times but not signed → flag for follow-up
- A SOP-driven task is overdue past SLA → escalate

Each watcher event becomes a notification *and* a structured decision in a new `ai_decision_queue` table.

**2.3 New `ai_decision_queue` table**
Columns: `id`, `type`, `title`, `context` (jsonb of the data the AI saw), `recommendation`, `status` (pending/approved/rejected/auto-executed), `risk_tier` (low/med/high — already in your audit_log pattern), `resolved_by`, `resolved_at`, `notes`.

This is the **memory loop**: every time the AI suggests something, it's logged. Approve/reject becomes training signal.

### Phase 3 — Always-on business context (the "Brain State")

**3.1 Build a `business_state_snapshot` document**
A compact markdown doc regenerated nightly (or on-demand) summarizing:
- Active clients + status + this-month profit
- Open projects + phase + progress + at-risk flag
- Cash position (revenue MTD, expenses MTD, runway)
- Team velocity (hours logged, tasks done, active SOPs)
- Top 5 open decisions in the queue

Stored in `company_summaries` with a special `summary_type = 'business_state'`. **Always injected into the AI agent's system prompt** so it has a baseline before tool calls.

**3.2 Context Pills in chat**
When you open the AI chat, show 3–5 dynamic pills based on state: "Goodland margin is -12% this month", "3 decisions need you", "Steven owes 14h of feedback". Clicking a pill auto-asks the AI about it.

### Phase 4 — Decision-loop learning

**4.1 Preference memory**
When you reject an AI suggestion with a reason, store it in a new `ai_preferences` table (e.g., "never auto-create check-in tasks for clients in onboarding phase"). These get loaded into the system prompt.

**4.2 Risk-tiered autonomy** (already partially built per memory)
Formalize: `low` = auto-execute + log, `medium` = queue for 1-click approve, `high` = require explicit approval with reasoning. Tied to the `ai_decision_queue.risk_tier`.

---

## Technical Details

**New tables**
- `business_settings` (key/value, single source for cost rules)
- `ai_decision_queue` (proactive suggestions awaiting/showing resolution)
- `ai_preferences` (learned rejections)

**New view**
- `v_client_profitability_live` — joins payments, time_entries, client_costs, business_settings

**New edge functions**
- `ai-watcher` (4-hour cron, lighter than daily engine)
- `ai-business-state` (regenerates the snapshot doc, called by daily engine)

**Modified files**
- `supabase/functions/ai-agent/index.ts` — add 2 profitability tools, inject business_state_snapshot into system prompt, load `ai_preferences`
- `supabase/functions/ai-daily-engine/index.ts` — feed it profitability data, write to `ai_decision_queue` instead of just notifications
- `src/pages/admin/Settings.tsx` (or new) — Business Rules editor
- `src/pages/BrainHub.tsx` — new "Decisions" panel showing the queue
- AI chat component — context pills

**No breaking changes** — existing tools, daily engine, brain hub all keep working. This adds layers on top.

---

## What this gets you

After Phase 1, you can ask: *"Is Goodland profitable this month?"* and get a real answer with labor cost included.

After Phase 2, the AI sends you: *"Heads up — you logged 4h on Steven today, that's now 18h this month against $1,200 retainer. Net margin: -$1,050. Decision needed: raise rate, cap hours, or absorb."*

After Phase 3, every chat starts with the AI already knowing the state of every client, project, and decision — no preamble needed.

After Phase 4, the AI stops re-suggesting things you've rejected and starts mirroring how you actually run the business.

---

## Recommended build order

I'd ship Phase 1 first as one focused build (1–2 sessions). It's the foundation everything else depends on, and it gives immediate value: real per-client profitability the moment it's done. Then we'd evaluate before moving to Phase 2.

**Approve this direction and I'll start with Phase 1: internal hourly cost + live profitability view + two new AI tools.**
