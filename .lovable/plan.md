
# Make Market Intelligence Actually Drive Action

Right now it scans news and writes summaries. That's "informative," not "useful." Below are 4 upgrades, ordered by impact. Pick any combination.

---

## Upgrade 1 — Per-Client Opportunity Scans (highest impact)

Instead of one generic agency-wide report, generate a **mini-report per active client** tailored to their industry. You have 6 real clients across very different verticals:

- Goodland Church → Religious Organization
- Sharie → Therapist
- Wellington Stovall + Rose Credit Repair → Financial Services
- Stephen Taylor (Kairos) → Security
- Crown And Associates → (industry TBD)

**What you get:** Each client gets 2–3 insights answering *"What should we post / pitch / build for THIS client this week?"* — e.g. "Therapy clients on TikTok are crushing it with the new 'silent walk' trend → here's a script for Sharie."

**Where it shows:** New "Client Intelligence" tab on each client page + a feed in Brain Hub grouped by client.

---

## Upgrade 2 — Content Idea Generator Tied to Real Trends

Convert insights into **draft content briefs** automatically. When Perplexity surfaces a trend (e.g. "TikTok Shop expansion"), the system generates:

- 3 hook options
- Suggested format (Reel / Short / carousel)
- Target client(s) it fits
- One-click "Create as task in Ops" button

Briefs get saved to a new `content_ideas` table linked to `client_id`, so they show up in the content pipeline next to existing assets — not buried in a report.

---

## Upgrade 3 — Competitor & Vendor Watchlist

A `watchlist` table where you add things to actively monitor:

- Competitor agencies (e.g. specific Houston shops)
- Tools you sell against (e.g. "Bland AI" for the phone assistant product)
- Hashtags / accounts you want to track

Each watchlist item gets scanned weekly. New entries trigger **alerts in the AI Command Center** (you already have this infrastructure per memory). Example alert: *"Competitor X just launched a $99/mo short-form package — here's how Vektiss compares."*

---

## Upgrade 4 — Auto-Action on High-Urgency Insights

Insights already have `urgency: high|medium|low`. Wire it up:

- **High urgency** → auto-create an Ops task with the `recommended_action` text, due in 2 days, linked to the relevant client
- **Medium** → push to AI Command Center as a card the user can dismiss or "convert to task"
- **Low** → stays in the report only

This closes the loop from "interesting article" → "thing on someone's todo list."

---

## Recommended sequence

If you want to start with one thing, do **Upgrade 1 + Upgrade 4 together**. That gives you per-client insights that automatically become tasks for your team. Upgrades 2 and 3 build on that foundation later.

---

## Technical Plan (if approved)

**Schema changes**
- `market_intelligence`: add `client_id uuid` (nullable, for agency-wide insights), `report_type text` (`agency` | `client`)
- New table `content_ideas`: `id, client_id, source_insight_id, hook, format, brief_markdown, status, created_at`
- New table `watchlist`: `id, label, type` (`competitor` | `tool` | `hashtag` | `account`), `query, last_scanned_at, active`

**Edge function changes** (`trigger-market-intelligence`)
- Branch on `report_type` param: `agency` (current behavior) or `client` (loop active clients, one Perplexity call each, save one row per client)
- After insert, trigger that scans `urgency='high'` insights and inserts into `tasks` table with `client_id` and `due_date = now() + 2 days`
- New edge function `scan-watchlist` for Upgrade 3, runnable via pg_cron weekly

**UI changes**
- Brain Hub: add tabs **Agency** / **By Client** / **Watchlist**
- Client detail page: new "Intelligence" section showing latest insights for that client + content idea drafts
- AI Command Center: subscribe to new `market_insight_alerts` event for medium-urgency items

**No new secrets needed** — Perplexity key is already configured.

---

Tell me which upgrades to build (1, 1+4, all 4, or other combo) and I'll implement.
