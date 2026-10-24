-- The published portal uses the external Supabase project configured by
-- VITE_SUPABASE_URL. Older Lovable Cloud database copies can still retain
-- these schedules and call-analysis triggers, which repeatedly process stale
-- records even though that database no longer serves the portal.
--
-- Keep this migration narrowly scoped: it removes only known legacy jobs and
-- automatic call analysis. It does not delete data or alter current client
-- reminders, onboarding checks, billing, or the event-driven email worker.
DO $$
DECLARE
  legacy_job record;
BEGIN
  FOR legacy_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'process-email-queue-every-minute',
      'sync-outlook-calendar-every-15min',
      'calendar-prep-tasks-hourly',
      'archive-done-tasks-daily'
    )
  LOOP
    PERFORM cron.unschedule(legacy_job.jobid);
  END LOOP;
END;
$$;

-- Fathom analysis is staff initiated. Legacy copies may not have received the
-- earlier manual-sync migration, so remove the triggers defensively here too.
DROP TRIGGER IF EXISTS auto_analyze_call_insert ON public.call_intelligence;
DROP TRIGGER IF EXISTS auto_analyze_call_update ON public.call_intelligence;
DROP FUNCTION IF EXISTS public.trg_auto_analyze_call();
