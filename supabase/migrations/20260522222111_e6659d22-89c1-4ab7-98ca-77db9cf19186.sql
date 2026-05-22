-- Pause all automated/notification emails (manual-only mode)
-- Drops DB triggers that auto-fire transactional emails and unschedules the daily reminders cron.
-- Trigger functions and edge functions remain deployed; re-enable SQL is at the bottom.

DROP TRIGGER IF EXISTS trg_email_on_payment ON public.client_payments;
DROP TRIGGER IF EXISTS trg_email_on_new_message ON public.messages;
DROP TRIGGER IF EXISTS trg_email_admins_on_client_message ON public.messages;
DROP TRIGGER IF EXISTS trg_email_on_project_update ON public.projects;
DROP TRIGGER IF EXISTS trg_email_on_task_assigned ON public.tasks;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-daily-reminders') THEN
    PERFORM cron.unschedule('send-daily-reminders');
  END IF;
END $$;

-- ============================================================
-- RE-ENABLE SQL (run manually to restore automated emails):
-- ============================================================
-- CREATE TRIGGER trg_email_on_payment AFTER INSERT ON public.client_payments
--   FOR EACH ROW EXECUTE FUNCTION email_on_payment();
-- CREATE TRIGGER trg_email_on_new_message AFTER INSERT ON public.messages
--   FOR EACH ROW EXECUTE FUNCTION email_on_new_message();
-- CREATE TRIGGER trg_email_admins_on_client_message AFTER INSERT ON public.messages
--   FOR EACH ROW EXECUTE FUNCTION email_admins_on_client_message();
-- CREATE TRIGGER trg_email_on_project_update AFTER UPDATE ON public.projects
--   FOR EACH ROW EXECUTE FUNCTION email_on_project_update();
-- CREATE TRIGGER trg_email_on_task_assigned AFTER INSERT OR UPDATE ON public.tasks
--   FOR EACH ROW EXECUTE FUNCTION email_on_task_assigned();
-- SELECT cron.schedule('send-daily-reminders','0 13 * * *', $$ ... $$);  -- restore original payload from git history
