-- Pause high-cost AI automations (manual-only mode)
-- Re-enable instructions are in the comment block at the bottom.

DROP TRIGGER IF EXISTS trg_auto_analyze_call ON public.call_intelligence;

DO $$
DECLARE
  j text;
BEGIN
  FOREACH j IN ARRAY ARRAY[
    'client-summaries-nightly',
    'ai-brain-snapshot-daily',
    'ai-daily-engine',
    'ai-watcher-daily',
    'ai-watcher-every-4-hours'
  ] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- TO RE-ENABLE LATER, run this (adjust schedules as needed):
-- ============================================================
-- CREATE TRIGGER trg_auto_analyze_call
--   AFTER INSERT OR UPDATE ON public.call_intelligence
--   FOR EACH ROW EXECUTE FUNCTION public.trg_auto_analyze_call();
--
-- select cron.schedule('client-summaries-nightly', '0 5 * * *',
--   $$ select net.http_post(url:='https://xtftehtsfnxsdsfmwkew.supabase.co/functions/v1/generate-client-summary',
--      headers:=jsonb_build_object('Content-Type','application/json','apikey','<ANON_KEY>'),
--      body:='{"all":true,"max_age_minutes":1440}'::jsonb); $$);
--
-- select cron.schedule('ai-brain-snapshot-daily', '0 6 * * *', $$ ... /ai-brain-snapshot ... $$);
-- select cron.schedule('ai-daily-engine',          '0 7 * * *', $$ ... /ai-daily-engine ... $$);
-- select cron.schedule('ai-watcher-daily',         '0 9 * * *', $$ ... /ai-watcher ... $$);
-- select cron.schedule('ai-watcher-every-4-hours', '0 */4 * * *', $$ ... /ai-watcher ... $$);
-- ============================================================