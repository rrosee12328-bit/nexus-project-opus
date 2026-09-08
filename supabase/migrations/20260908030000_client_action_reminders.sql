-- Client-safe requests, submissions, onboarding linkage, and call reminder metadata.
CREATE TABLE IF NOT EXISTS public.client_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  onboarding_session_id uuid REFERENCES public.onboarding_sessions(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'onboarding')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  instructions text,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'awaiting_review', 'completed', 'cancelled')),
  reminders_enabled_at timestamptz,
  submitted_at timestamptz,
  submission_note text,
  submission_url text,
  submission_file_path text,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (onboarding_session_id)
);

CREATE INDEX IF NOT EXISTS idx_client_action_items_client_status
  ON public.client_action_items (client_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_client_action_items_reminders
  ON public.client_action_items (reminders_enabled_at, status, due_at)
  WHERE reminders_enabled_at IS NOT NULL AND status = 'pending';

ALTER TABLE public.client_action_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.client_action_items;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END;
$$;
ALTER TABLE public.client_action_items REPLICA IDENTITY FULL;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS in_app_actions boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_actions boolean NOT NULL DEFAULT true;

CREATE POLICY "Clients view own action items" ON public.client_action_items
  FOR SELECT TO authenticated
  USING (client_id = public.get_client_id_for_user(auth.uid()));

CREATE POLICY "Staff manage client action items" ON public.client_action_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ops'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ops'::app_role));

CREATE POLICY "Service role manages client action items" ON public.client_action_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_client_action_items_updated_at ON public.client_action_items;
CREATE TRIGGER update_client_action_items_updated_at
  BEFORE UPDATE ON public.client_action_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('client-action-submissions', 'client-action-submissions', false, 50000000)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 50000000;

DROP POLICY IF EXISTS "Clients upload own action submissions" ON storage.objects;
DROP POLICY IF EXISTS "Clients read own action submissions" ON storage.objects;
DROP POLICY IF EXISTS "Staff manage action submissions" ON storage.objects;

CREATE POLICY "Clients upload own action submissions" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'client-action-submissions'
    AND (storage.foldername(name))[1] = public.get_client_id_for_user(auth.uid())::text
  );
CREATE POLICY "Clients read own action submissions" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'client-action-submissions'
    AND (storage.foldername(name))[1] = public.get_client_id_for_user(auth.uid())::text
  );
CREATE POLICY "Staff manage action submissions" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'client-action-submissions' AND (
    public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ops'::app_role)
  ))
  WITH CHECK (bucket_id = 'client-action-submissions' AND (
    public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ops'::app_role)
  ));

CREATE OR REPLACE FUNCTION public.submit_my_client_action(
  _action_id uuid,
  _submission_note text DEFAULT NULL,
  _submission_url text DEFAULT NULL,
  _submission_file_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _client_id uuid;
BEGIN
  SELECT client_id INTO _client_id
  FROM public.client_action_items
  WHERE id = _action_id
    AND client_id = public.get_client_id_for_user(auth.uid())
    AND status = 'pending'
  FOR UPDATE;

  IF _client_id IS NULL THEN
    RAISE EXCEPTION 'Action item is unavailable';
  END IF;
  IF _submission_file_path IS NOT NULL
     AND split_part(_submission_file_path, '/', 1) <> _client_id::text THEN
    RAISE EXCEPTION 'Invalid submission file path';
  END IF;
  IF nullif(trim(_submission_url), '') IS NOT NULL AND trim(_submission_url) !~* '^https?://' THEN
    RAISE EXCEPTION 'Submission link must start with http:// or https://';
  END IF;

  UPDATE public.client_action_items
  SET status = 'awaiting_review',
      submitted_at = now(),
      submission_note = nullif(trim(_submission_note), ''),
      submission_url = nullif(trim(_submission_url), ''),
      submission_file_path = nullif(trim(_submission_file_path), ''),
      reminders_enabled_at = NULL,
      reviewed_at = NULL,
      reviewed_by = NULL
  WHERE id = _action_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_my_client_action(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_my_client_action(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_client_action_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _client_user_id uuid;
  _client_name text;
BEGIN
  SELECT user_id, name INTO _client_user_id, _client_name
  FROM public.clients WHERE id = NEW.client_id;

  IF TG_OP = 'INSERT' AND _client_user_id IS NOT NULL AND COALESCE(
    (SELECT in_app_actions FROM public.notification_preferences WHERE user_id = _client_user_id), true
  ) THEN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (_client_user_id, 'New action requested', NEW.title, 'client_action', '/portal/actions');
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'awaiting_review' THEN
      INSERT INTO public.notifications (user_id, title, body, type, link)
      SELECT ur.user_id, 'Client submission ready', coalesce(_client_name, 'A client') || ': ' || NEW.title,
        'client_action', '/admin/clients/' || NEW.client_id
      FROM public.user_roles ur WHERE ur.role IN ('admin', 'ops');
    ELSIF NEW.status = 'pending' AND _client_user_id IS NOT NULL AND COALESCE(
      (SELECT in_app_actions FROM public.notification_preferences WHERE user_id = _client_user_id), true
    ) THEN
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (_client_user_id, 'Action needs another update', NEW.title, 'client_action', '/portal/actions');
    ELSIF NEW.status = 'completed' AND _client_user_id IS NOT NULL AND COALESCE(
      (SELECT in_app_actions FROM public.notification_preferences WHERE user_id = _client_user_id), true
    ) THEN
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (_client_user_id, 'Action completed', NEW.title, 'client_action', '/portal/actions');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_client_action_change ON public.client_action_items;
CREATE TRIGGER notify_client_action_change
  AFTER INSERT OR UPDATE OF status ON public.client_action_items
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_action_change();

CREATE OR REPLACE FUNCTION public.create_onboarding_client_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.client_action_items (
    client_id, onboarding_session_id, source_type, title, instructions, due_at, reminders_enabled_at
  ) VALUES (
    NEW.client_id, NEW.id, 'onboarding', 'Complete your Vektiss onboarding',
    'Choose on-demand onboarding or schedule a live onboarding call so we can prepare your project.',
    now() + interval '3 days', now()
  ) ON CONFLICT (onboarding_session_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_onboarding_client_action ON public.onboarding_sessions;
CREATE TRIGGER create_onboarding_client_action
  AFTER INSERT ON public.onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION public.create_onboarding_client_action();

CREATE OR REPLACE FUNCTION public.sync_onboarding_client_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.client_action_items
    SET status = 'completed', reminders_enabled_at = NULL,
        reviewed_at = COALESCE(reviewed_at, now())
    WHERE onboarding_session_id = NEW.id AND status <> 'cancelled';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_onboarding_client_action ON public.onboarding_sessions;
CREATE TRIGGER sync_onboarding_client_action
  AFTER UPDATE OF status ON public.onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION public.sync_onboarding_client_action();

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS external_event_uri text,
  ADD COLUMN IF NOT EXISTS external_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS event_timezone text,
  ADD COLUMN IF NOT EXISTS join_url text,
  ADD COLUMN IF NOT EXISTS cancel_url text,
  ADD COLUMN IF NOT EXISTS reschedule_url text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_reminders_enabled_at timestamptz;

CREATE OR REPLACE FUNCTION public.prepare_client_call_reminders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NOT NULL AND NEW.event_type IN ('calendly', 'meeting', 'call') AND NEW.cancelled_at IS NULL THEN
    NEW.event_timezone := COALESCE(NEW.event_timezone, 'America/Chicago');
    IF NEW.external_starts_at IS NULL THEN
      NEW.external_starts_at := NEW.start_time;
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.event_date IS DISTINCT FROM OLD.event_date OR NEW.start_time IS DISTINCT FROM OLD.start_time THEN
        NEW.external_starts_at := NEW.start_time;
      END IF;
    END IF;
    NEW.client_reminders_enabled_at := COALESCE(NEW.client_reminders_enabled_at, now());
  ELSE
    NEW.client_reminders_enabled_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prepare_client_call_reminders ON public.calendar_events;
CREATE TRIGGER prepare_client_call_reminders
  BEFORE INSERT OR UPDATE OF client_id, event_type, event_date, start_time, event_timezone, cancelled_at
  ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.prepare_client_call_reminders();

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_external_uri
  ON public.calendar_events (external_event_uri) WHERE external_event_uri IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_events_client_reminders
  ON public.calendar_events (event_date, start_time)
  WHERE client_id IS NOT NULL AND client_reminders_enabled_at IS NOT NULL AND cancelled_at IS NULL;

CREATE OR REPLACE FUNCTION public.get_my_upcoming_calls()
RETURNS TABLE (
  id uuid, title text, starts_at timestamptz, event_timezone text,
  join_url text, cancel_url text, reschedule_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.title,
    COALESCE(e.external_starts_at, e.start_time),
    COALESCE(e.event_timezone, 'America/Chicago'), e.join_url, e.cancel_url, e.reschedule_url
  FROM public.calendar_events e
  WHERE e.client_id = public.get_client_id_for_user(auth.uid())
    AND e.cancelled_at IS NULL
    AND COALESCE(e.external_starts_at, e.start_time) > now()
  ORDER BY e.event_date, e.start_time;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_upcoming_calls() TO authenticated;

-- Run frequently for precise call reminders. The function itself sends the daily
-- action digest only during the 9 AM America/Chicago window.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'client-action-reminders';
    PERFORM cron.schedule(
      'client-action-reminders',
      '*/5 * * * *',
      $job$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/send-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
        ),
        body := '{"source":"client-action-reminders"}'::jsonb
      );
      $job$
    );
  END IF;
END;
$$;
