-- Ensure pg_net is available (pg_cron already enabled elsewhere)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove any prior versions of these jobs so this is idempotent
DO $$
BEGIN
  PERFORM cron.unschedule('ai-watcher-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('ai-brain-snapshot-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Daily AI Watcher — 9:00 AM UTC
SELECT cron.schedule(
  'ai-watcher-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := COALESCE(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1),
      'https://xtftehtsfnxsdsfmwkew.supabase.co'
    ) || '/functions/v1/ai-watcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

-- Daily Brain State snapshot — 6:00 AM UTC (before watcher so context is fresh)
SELECT cron.schedule(
  'ai-brain-snapshot-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := COALESCE(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1),
      'https://xtftehtsfnxsdsfmwkew.supabase.co'
    ) || '/functions/v1/ai-brain-snapshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);