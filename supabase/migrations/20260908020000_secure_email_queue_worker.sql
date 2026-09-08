-- Use a dedicated shared secret for the pg_net email worker. The secret value
-- is provisioned separately in encrypted Vault and Edge Function Secrets.
CREATE OR REPLACE FUNCTION public.email_queue_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _worker_secret text;
  _supabase_url text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
     AND NOT EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
    BEGIN
      PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
      IF EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
         OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
        RETURN;
      END IF;
      PERFORM cron.unschedule('process-email-queue');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_dispatch: cron unschedule failed: %', SQLERRM;
    END;
    RETURN;
  END IF;

  IF (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now() THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO _worker_secret
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_worker_secret'
  LIMIT 1;

  SELECT decrypted_secret INTO _supabase_url
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_url'
  LIMIT 1;

  IF _worker_secret IS NULL OR _supabase_url IS NULL THEN
    RAISE WARNING 'email_queue_dispatch: worker secret or project URL is missing';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Email-Worker-Secret', _worker_secret
    ),
    body := '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.email_queue_wake()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _worker_secret text;
  _supabase_url text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    BEGIN
      PERFORM cron.schedule(
        'process-email-queue',
        '5 seconds',
        $cron$ SELECT public.email_queue_dispatch(); $cron$
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_wake: cron schedule failed: %', SQLERRM;
    END;
  END IF;

  SELECT decrypted_secret INTO _worker_secret
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_worker_secret'
  LIMIT 1;

  SELECT decrypted_secret INTO _supabase_url
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_url'
  LIMIT 1;

  IF _worker_secret IS NOT NULL AND _supabase_url IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url := _supabase_url || '/functions/v1/process-email-queue',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Email-Worker-Secret', _worker_secret
        ),
        body := '{}'::jsonb
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'email_queue_wake failed (enqueue preserved): %', SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO service_role;

-- PGMQ does not emit a row trigger through pgmq.send(), so arm the worker in
-- the shared enqueue function used by every email-producing feature.
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _message_id bigint;
BEGIN
  BEGIN
    _message_id := pgmq.send(queue_name, payload);
  EXCEPTION WHEN undefined_table THEN
    PERFORM pgmq.create(queue_name);
    _message_id := pgmq.send(queue_name, payload);
  END;

  BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
      PERFORM cron.schedule(
        'process-email-queue',
        '5 seconds',
        $cron$ SELECT public.email_queue_dispatch(); $cron$
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'enqueue_email: worker schedule failed: %', SQLERRM;
  END;

  RETURN _message_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
