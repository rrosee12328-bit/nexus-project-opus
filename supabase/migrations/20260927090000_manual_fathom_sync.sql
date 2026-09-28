-- Fathom imports are staff initiated, never scheduled.
DO $$
DECLARE job record;
BEGIN
  FOR job IN SELECT jobid FROM cron.job
    WHERE jobname = 'sync-fathom-call-time' OR command ILIKE '%fathom-sync%'
  LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;
END;
$$;

-- Analysis must also be initiated by staff. The old database triggers called
-- analyze-call whenever a summary changed, which bypassed the manual-only rule.
DROP TRIGGER IF EXISTS auto_analyze_call_insert ON public.call_intelligence;
DROP TRIGGER IF EXISTS auto_analyze_call_update ON public.call_intelligence;
DROP FUNCTION IF EXISTS public.trg_auto_analyze_call();
