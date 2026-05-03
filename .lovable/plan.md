# Adopt "The Brain" Design Language Site-Wide

Make every admin + ops page feel like The Brain page: editorial hero, mono kicker labels, bordered joined stat strips, animated counters, pulse-dot meta rows, and 12-col asymmetric grids. Client portal stays warmer (untouched).

## 1. Build a shared design kit

Create `src/components/ui/page-shell/` with reusable primitives so every page composes the same way:

- **`PageHero`** — kicker (mono uppercase) + big tracked title + muted subtitle + slot for top-right action
- **`StatStrip`** — bordered, joined, divided KPI tiles (the signature move from The Brain). Props: `stats[]`, optional `activeKey` for filter behavior, optional active-tab top-line indicator
- **`Counter`** — animated tabular-nums number (extract from KnowledgeBase.tsx)
- **`MetaRow`** — pulse-dot status row under heros (`last synced 2m ago · 12 active · 3 pending`)
- **`SectionLabel`** — `[10px] font-mono uppercase tracking-wider text-muted-foreground` wrapper for section headers
- **`EditorialGrid`** — 12-col grid helper with common splits (7+5, 8+4, 6+6)

These become the lego blocks for every page.

## 2. Apply to pages (one coordinated pass)

For each page: replace the current header with `PageHero`, replace top KPI cards with `StatStrip`, swap section `CardTitle`s for `SectionLabel`, restructure equal grids to editorial 12-col where it makes sense, swap detail Dialogs for Sheet drawers.

**Admin pages (in priority order):**
1. **Dashboard** (`BrainHub.tsx`) — biggest win: replace Pulse/Money/Operations cards with StatStrip pattern, hero with kicker "VEKTISS / COMMAND CENTER"
2. **Clients** — hero + StatStrip (Total / Active / At-risk / MRR), editorial list
3. **Projects** — hero + StatStrip (Active / In review / Overdue / Avg progress)
4. **Leads / Sales Pipeline** — hero + StatStrip (Pipeline value / Hot / Warm / Conversion %)
5. **Financials + Reports** — hero + StatStrip, editorial 8+4 (chart + breakdown)
6. **Calls / Messages / Calendar** — hero + meta row, lighter touch
7. **Proposals / Invoices / Hourly Invoices / Assets / Client Tracker / Summaries** — hero + StatStrip

**Ops pages:**
- **Ops Dashboard, Tasks, Timesheets, SOPs, Email Intelligence** — same treatment, kicker "VEKTISS / OPS"

**Out of scope (intentionally untouched):**
- Client portal (warmer tone for clients)
- Login / Signup / Public Proposal / Reset Password (marketing surfaces)

## 3. Sweep cleanup

- Remove redundant `Card` + `CardHeader` wrappers where `PageHero` + `SectionLabel` replace them
- Standardize all KPI numbers to `font-mono tabular-nums` via `Counter`
- Audit padding: pages should use `container mx-auto px-4 sm:px-6 max-w-7xl py-8 space-y-10` (matching The Brain)

## Technical details

**File changes:**
- New: `src/components/ui/page-shell/{PageHero,StatStrip,Counter,MetaRow,SectionLabel,EditorialGrid}.tsx` + `index.ts`
- Edit: ~20 page files in `src/pages/admin/` and `src/pages/ops/`
- No DB or routing changes
- No breaking changes — pure presentational refactor

**Design tokens used (already in `index.css`):** `--border`, `--muted-foreground`, `--primary`, `--background`. No new colors needed.

**Save to memory:** add `mem://design/page-shell-system` documenting the new house style so future pages auto-conform.

## Suggested execution

To keep diffs reviewable, ship in 2 PRs worth of work:
- **Wave 1:** Build the kit + apply to Dashboard, Clients, Projects, Leads (the most-viewed pages)
- **Wave 2:** Apply to Financials, Reports, Calls, Messages, Calendar, Proposals, Invoices, Assets, Summaries, ClientTracker, and all Ops pages

Want me to do both waves in one go, or stop after Wave 1 for you to review the feel before continuing?
