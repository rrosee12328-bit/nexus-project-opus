## The problem

The current `/admin/knowledge-base` is four tabs of text-heavy tables (SOPs, Summaries, Insights, Client Notes). It reads like a database admin tool — you scroll long content, expand rows, and re-read everything you already wrote. There's no synthesis, no visual hook, nothing that feels like a "brain." Today: 2 SOPs, 35 summaries, 0 insights, 27 client notes — plenty of data, zero overview.

## The new vision: "The Brain"

Replace the tabbed table layout with a **visual command center** that surfaces *what's in the AI's memory at a glance*, with drilldowns only when needed. Reading full documents stays available, but it's not the default mode — that's what download/expand is for.

### Layout (top to bottom)

```text
┌────────────────────────────────────────────────────────────┐
│  THE BRAIN         [Feed the Brain +]  [Ask the Brain 🔍] │
│  "Your AI's memory — everything it knows about your biz"   │
├────────────────────────────────────────────────────────────┤
│  4 stat orbs (animated):                                   │
│   🧠 35 Memories  📋 2 SOPs  💡 0 Insights  📝 27 Notes   │
├────────────────────────────────────────────────────────────┤
│  KNOWLEDGE GRAPH (left, 60%)    │  PULSE FEED (right, 40%) │
│  ┌──────────────────────┐       │  Last fed: 3d ago        │
│  │   ●─────●            │       │  • Summary added (Acme)  │
│  │  /│     │\           │       │  • SOP updated           │
│  │ ● │     │ ●─●        │       │  • Note: meeting recap   │
│  │  \│     │/           │       │  ────                    │
│  │   ●─────●            │       │  GAPS DETECTED:          │
│  └──────────────────────┘       │  ⚠ 3 clients no notes    │
│  Nodes = clients/topics         │  ⚠ 0 strategic insights  │
│  Edges = shared tags/mentions   │  ⚠ Onboarding SOP stale  │
├────────────────────────────────────────────────────────────┤
│  RECENT MEMORIES  (horizontal scroll of small cards)        │
│  Each card: icon + title + 2-line preview + "by client"    │
│  Click → side drawer with full content (no nav away)       │
├────────────────────────────────────────────────────────────┤
│  TOPIC CLOUD                                                │
│  Tag chips sized by frequency across all knowledge          │
│  (onboarding · pricing · content · reels · feedback...)     │
└────────────────────────────────────────────────────────────┘
```

### Key UX shifts vs today

| Today | New |
|---|---|
| 4 separate tabs | 1 unified dashboard, content **filtered by lens** (chips: All / SOPs / Summaries / Notes / Insights) |
| Open table row to read full content | Click card → **side drawer** slides in (keeps you on the page) |
| Long markdown dump | Cards show **AI-generated 2-line gist** of each item (not the raw text) |
| Manual hunt for what's missing | **Gaps panel** flags clients with no notes, missing SOPs, stale summaries |
| No relationships | **Knowledge Graph** visualizes how clients/topics interconnect via shared tags & mentions |
| Tags hidden in rows | **Topic Cloud** shows what your business is "thinking about" |
| Boring CRUD | "Feed the Brain" CTA — single dialog that auto-routes to the right table by type |

### What stays available (just not in your face)

- Full read mode → side drawer with `<MarkdownRenderer>` + Download button
- Edit / Delete → drawer footer actions (admin only)
- Search → still there, top-right, but Cmd+K style instant filter across all types

## Implementation scope

### New file: `src/pages/admin/KnowledgeBase.tsx` (rewrite)
Replace the current tabbed table file with the dashboard layout above. Reuse the existing queries (sops, company_summaries, strategic_insights, client_notes) — no schema changes needed.

### New components in `src/components/knowledge/`
- `BrainStatsOrbs.tsx` — 4 animated stat tiles with counts + last-updated time
- `KnowledgeGraph.tsx` — force-directed graph using `react-force-graph-2d` (nodes = clients + topic clusters, edges = co-occurrence in notes/summaries)
- `PulseFeed.tsx` — chronological activity stream + "Gaps Detected" alerts (computed client-side: clients with 0 notes, summaries older than 30d, etc.)
- `MemoryCard.tsx` — compact card with icon, title, 2-line preview, source badge, click → opens drawer
- `MemoryDrawer.tsx` — Sheet component showing full content + edit/delete/download
- `TopicCloud.tsx` — tag frequency cloud, click a tag to filter the whole dashboard
- `FeedTheBrainDialog.tsx` — already exists at `src/components/FeedTheBrainDialog.tsx`, repurpose/wire it as the single "add" entry point

### Dependency
Add `react-force-graph-2d` for the knowledge graph (lightweight, canvas-based, mobile-friendly).

### Reused
- Existing CRUD mutations from current KnowledgeBase.tsx (lifted into a `useKnowledgeMutations` hook)
- `AICommandCenter`, `Card`, `Sheet`, `Badge`, `Input` from existing UI kit
- Vektiss Blue + dark/light theme tokens (per memory)

## Out of scope (this pass)

- AI-generated 2-line gists for existing items (would need an edge function pass — can be added later; for now show first 120 chars truncated cleanly)
- Editing the underlying tables/RLS — schema is fine
- Mobile graph interactions beyond pan/zoom (works, but not optimized for fat-finger node selection)

## Open questions

Before I build, two quick choices:

1. **Knowledge Graph vs simpler "Mind Map" style** — graph is interactive but can look messy with sparse data (you have 0 insights, 2 SOPs). A clean mind-map (Vektiss at center, branches to Clients → Notes/Summaries) might feel more "brain-like" with current data volume. Want graph or mind-map?
2. **Gist generation** — want me to add a "Refresh gists" button that runs Lovable AI over each item once to store a 2-line summary in a new column? Or just truncate raw content for v1?