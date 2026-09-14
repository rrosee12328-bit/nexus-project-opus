-- Each imported meeting owns at most one time entry. Re-syncing updates that
-- entry instead of duplicating billable time.
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS source_call_id uuid
    REFERENCES public.call_intelligence(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entries_source_call_unique
  ON public.time_entries(source_call_id);

-- Pull newly completed Fathom recordings regularly. The service-role key stays
-- in Vault and the edge function still requires authenticated requests.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'sync-fathom-call-time';

  PERFORM cron.schedule(
    'sync-fathom-call-time',
    '*/15 * * * *',
    $job$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/fathom-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
        ),
        body := '{"sync_all_missing":true,"lookback_days":2}'::jsonb
      );
    $job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not schedule automatic Fathom sync: %', SQLERRM;
END;
$$;
