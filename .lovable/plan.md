## Goal
Stop the high-cost AI automations from firing on their own. Everything stays deployed — you (or buttons in the app) can still run them on demand.

## What gets paused

1. **Auto-analyze every new call**
   - Drop trigger `trg_auto_analyze_call` on `call_intelligence` (and keep the function body in case you re-enable later).
   - Effect: new Fathom syncs / call rows no longer auto-invoke `analyze-call`. You'll trigger it manually from the call detail page (the existing "Analyze" button keeps working).

2. **Nightly client summaries cron (5am)**
   - Unschedule pg_cron job `client-summaries-nightly` (jobid 13).
   - Effect: rolling client summaries stop refreshing in bulk at night. Per-event triggers (notes, calls, payments, projects, approvals) are *not* part of this request and stay on — say the word if you want those off too.

3. **AI brain + daily engine + watcher crons**
   - Unschedule:
     - `ai-brain-snapshot-daily` (jobid 12, 6am)
     - `ai-daily-engine` (jobid 7, 7am)
     - `ai-watcher-daily` (jobid 11, 9am)
     - `ai-watcher-every-4-hours` (jobid 9)
   - Effect: no autonomous daily briefing, brain snapshot, or watcher flags. Brain Hub will show whatever the last snapshot was. You can re-run any of these manually from the existing admin UI / curl.

## What stays on (untouched)
- `process-email-queue` (every 5s) — needed for transactional email delivery
- `send-daily-reminders` (1pm) — lightweight, no AI cost
- `archive-done-tasks-daily` — pure SQL
- `calendar-prep-tasks-hourly`, `sync-outlook-calendar-every-15min` — calendar sync, no AI
- Per-event `queue_client_summary_refresh` triggers on notes/calls/payments/etc.
- Manual buttons (Analyze call, Refresh summary, Run brain snapshot, etc.)

## How re-enable works
A short SQL snippet brings each cron job and the trigger back. I'll drop it in a comment in the migration so you can flip everything back on in seconds.

## Single migration
One migration:
- `DROP TRIGGER IF EXISTS trg_auto_analyze_call ON public.call_intelligence;`
- `SELECT cron.unschedule(jobname)` for the 4 cron jobs above (guarded with IF EXISTS).
- Comment block with the exact re-enable SQL.

No edge-function code changes, no UI changes.
