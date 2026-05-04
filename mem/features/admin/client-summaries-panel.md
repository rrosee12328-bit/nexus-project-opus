---
name: Client Summaries rolling document
description: Right-side sidebar shows AI-generated headline+summary+next_step per client. Cached in client_ai_summaries table; auto-refreshed by triggers on notes/calls/payments/projects/approvals + nightly 5am cron.
type: feature
---
- Table `client_ai_summaries` (PK client_id) holds headline, summary, next_step, sentiment, counts, source_hash.
- Edge fn `generate-client-summary` uses Lovable AI Gateway (gemini-2.5-flash) with structured tool-calling. Skips work when source_hash unchanged unless force=true. Modes: {client_id} | {client_ids:[]} | {all:true, max_age_minutes}.
- Triggers fire `queue_client_summary_refresh(client_id)` (uses vault `email_queue_service_role_key` + `supabase_url`) on: client_notes INSERT, call_intelligence INSERT/UPDATE of summary|key_decisions, client_payments INSERT (non-Projected), projects UPDATE OF status|current_phase, approval_requests UPDATE.
- Nightly pg_cron job `client-summaries-nightly` at 05:00 calls fn with {all:true, max_age_minutes:1440}.
- UI: `src/components/ClientSummariesPanel.tsx`. Realtime on table. Auto-fills missing rows on first open. Sort: attention-first (stale, negative sentiment, or active w/ no contact >14d).
