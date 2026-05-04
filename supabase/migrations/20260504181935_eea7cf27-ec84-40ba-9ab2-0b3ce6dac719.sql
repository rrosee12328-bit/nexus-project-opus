
-- 1. Table
CREATE TABLE IF NOT EXISTS public.client_ai_summaries (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  headline text,
  summary text,
  next_step text,
  sentiment text,
  notes_count integer NOT NULL DEFAULT 0,
  calls_count integer NOT NULL DEFAULT 0,
  source_hash text,
  model text,
  generated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_ai_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage client_ai_summaries"
  ON public.client_ai_summaries FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Ops view client_ai_summaries"
  ON public.client_ai_summaries FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'ops'::app_role));

CREATE POLICY "Service role full access client_ai_summaries"
  ON public.client_ai_summaries FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

ALTER PUBLICATION supabase_realtime ADD TABLE public.client_ai_summaries;

-- 2. Helper: fire-and-forget call to the edge function
CREATE OR REPLACE FUNCTION public.queue_client_summary_refresh(_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _service_role_key text;
  _supabase_url text;
BEGIN
  IF _client_id IS NULL THEN RETURN; END IF;

  BEGIN
    SELECT decrypted_secret INTO _service_role_key
    FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    _service_role_key := NULL;
  END;

  IF _service_role_key IS NULL THEN RETURN; END IF;

  BEGIN
    SELECT decrypted_secret INTO _supabase_url
    FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    _supabase_url := NULL;
  END;

  IF _supabase_url IS NULL OR _supabase_url = '' THEN
    _supabase_url := 'https://xtftehtsfnxsdsfmwkew.supabase.co';
  END IF;

  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/generate-client-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    body := jsonb_build_object('client_id', _client_id)
  );
EXCEPTION WHEN OTHERS THEN
  -- Never block the original write
  NULL;
END;
$$;

-- 3. Trigger functions
CREATE OR REPLACE FUNCTION public.trg_refresh_summary_from_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.queue_client_summary_refresh(NEW.client_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_summary_from_call()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.client_id IS NOT NULL THEN
    PERFORM public.queue_client_summary_refresh(NEW.client_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_summary_from_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.notes IS DISTINCT FROM 'Projected' THEN
    PERFORM public.queue_client_summary_refresh(NEW.client_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_summary_from_project()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.client_id IS NOT NULL THEN
    PERFORM public.queue_client_summary_refresh(NEW.client_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_summary_from_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.client_id IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.queue_client_summary_refresh(NEW.client_id);
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Triggers
DROP TRIGGER IF EXISTS refresh_summary_on_note ON public.client_notes;
CREATE TRIGGER refresh_summary_on_note
  AFTER INSERT ON public.client_notes
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_summary_from_note();

DROP TRIGGER IF EXISTS refresh_summary_on_call ON public.call_intelligence;
CREATE TRIGGER refresh_summary_on_call
  AFTER INSERT OR UPDATE OF summary, key_decisions ON public.call_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_summary_from_call();

DROP TRIGGER IF EXISTS refresh_summary_on_payment ON public.client_payments;
CREATE TRIGGER refresh_summary_on_payment
  AFTER INSERT ON public.client_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_summary_from_payment();

DROP TRIGGER IF EXISTS refresh_summary_on_project ON public.projects;
CREATE TRIGGER refresh_summary_on_project
  AFTER UPDATE OF status, current_phase ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_summary_from_project();

DROP TRIGGER IF EXISTS refresh_summary_on_approval ON public.approval_requests;
CREATE TRIGGER refresh_summary_on_approval
  AFTER UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_summary_from_approval();

-- 5. Nightly cron — refresh anything older than 24h
DO $$
DECLARE
  _service_role_key text;
  _supabase_url text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO _service_role_key FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _service_role_key := NULL; END;

  BEGIN
    SELECT decrypted_secret INTO _supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _supabase_url := NULL; END;

  IF _supabase_url IS NULL OR _supabase_url = '' THEN
    _supabase_url := 'https://xtftehtsfnxsdsfmwkew.supabase.co';
  END IF;

  IF _service_role_key IS NOT NULL THEN
    PERFORM cron.unschedule('client-summaries-nightly') WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'client-summaries-nightly'
    );
    PERFORM cron.schedule(
      'client-summaries-nightly',
      '0 5 * * *',
      format($cron$
        SELECT net.http_post(
          url := %L,
          headers := %L::jsonb,
          body := %L::jsonb
        );
      $cron$,
        _supabase_url || '/functions/v1/generate-client-summary',
        jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || _service_role_key)::text,
        jsonb_build_object('all', true, 'max_age_minutes', 1440)::text
      )
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
