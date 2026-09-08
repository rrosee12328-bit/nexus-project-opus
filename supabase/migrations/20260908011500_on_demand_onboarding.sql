-- Conversational, resumable client onboarding with private voice recordings.
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS onboarding_welcome_video_url text,
  ADD COLUMN IF NOT EXISTS onboarding_calendly_url text;

ALTER TABLE public.onboarding_templates
  ADD COLUMN IF NOT EXISTS onboarding_questions jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.onboarding_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  method text CHECK (method IN ('on_demand', 'scheduled_call')),
  status text NOT NULL DEFAULT 'welcome' CHECK (status IN ('welcome', 'choose_method', 'in_progress', 'review', 'scheduled', 'completed')),
  intro_video_completed_at timestamptz,
  recording_consent_at timestamptz,
  current_question_index integer NOT NULL DEFAULT 0,
  pending_follow_up text,
  pending_follow_up_for_key text,
  approved_summary text,
  scheduled_event_id uuid REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  scheduled_at timestamptz,
  stale_alerted_at timestamptz,
  completed_at timestamptz,
  completion_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onboarding_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.onboarding_sessions(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  question_key text NOT NULL,
  question_prompt text NOT NULL,
  response_type text NOT NULL CHECK (response_type IN ('text', 'voice')),
  answer_text text,
  transcript_text text,
  recording_path text,
  recording_duration_seconds integer,
  transcription_status text NOT NULL DEFAULT 'not_needed' CHECK (transcription_status IN ('not_needed', 'pending', 'processing', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_key)
);

CREATE INDEX IF NOT EXISTS onboarding_responses_session_idx ON public.onboarding_responses(session_id, created_at);

ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients read own onboarding session" ON public.onboarding_sessions;
DROP POLICY IF EXISTS "Clients update own unfinished onboarding session" ON public.onboarding_sessions;
DROP POLICY IF EXISTS "Staff manage onboarding sessions" ON public.onboarding_sessions;
CREATE POLICY "Clients read own onboarding session" ON public.onboarding_sessions
  FOR SELECT TO authenticated USING (client_id = public.get_client_id_for_user(auth.uid()));
CREATE POLICY "Staff manage onboarding sessions" ON public.onboarding_sessions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ops'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ops'::app_role));

DROP POLICY IF EXISTS "Clients read own onboarding responses" ON public.onboarding_responses;
DROP POLICY IF EXISTS "Clients add own onboarding responses" ON public.onboarding_responses;
DROP POLICY IF EXISTS "Clients update own draft onboarding responses" ON public.onboarding_responses;
DROP POLICY IF EXISTS "Staff manage onboarding responses" ON public.onboarding_responses;
CREATE POLICY "Clients read own onboarding responses" ON public.onboarding_responses
  FOR SELECT TO authenticated USING (client_id = public.get_client_id_for_user(auth.uid()));
CREATE POLICY "Clients add own onboarding responses" ON public.onboarding_responses
  FOR INSERT TO authenticated WITH CHECK (
    client_id = public.get_client_id_for_user(auth.uid())
    AND EXISTS (SELECT 1 FROM public.onboarding_sessions s WHERE s.id = session_id AND s.client_id = client_id AND s.status <> 'completed')
  );
CREATE POLICY "Clients update own draft onboarding responses" ON public.onboarding_responses
  FOR UPDATE TO authenticated
  USING (client_id = public.get_client_id_for_user(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.onboarding_sessions s WHERE s.id = session_id AND s.status <> 'completed'
  ))
  WITH CHECK (client_id = public.get_client_id_for_user(auth.uid()));
CREATE POLICY "Staff manage onboarding responses" ON public.onboarding_responses
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ops'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ops'::app_role));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('onboarding-recordings', 'onboarding-recordings', false, 25000000, ARRAY['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 25000000,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Clients upload own onboarding recordings" ON storage.objects;
DROP POLICY IF EXISTS "Clients read own onboarding recordings" ON storage.objects;
DROP POLICY IF EXISTS "Staff manage onboarding recordings" ON storage.objects;
CREATE POLICY "Clients upload own onboarding recordings" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'onboarding-recordings'
    AND (storage.foldername(name))[1] = public.get_client_id_for_user(auth.uid())::text
  );
CREATE POLICY "Clients read own onboarding recordings" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'onboarding-recordings'
    AND (storage.foldername(name))[1] = public.get_client_id_for_user(auth.uid())::text
  );
CREATE POLICY "Staff manage onboarding recordings" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'onboarding-recordings' AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ops'::app_role)))
  WITH CHECK (bucket_id = 'onboarding-recordings' AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ops'::app_role)));

CREATE OR REPLACE FUNCTION public.get_my_onboarding_context()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _client public.clients%ROWTYPE;
  _session public.onboarding_sessions%ROWTYPE;
  _settings public.business_settings%ROWTYPE;
  _questions jsonb;
  _core jsonb := '[
    {"key":"business_overview","prompt":"Tell us about your business, what you offer, and who you serve.","required":true,"max_duration_seconds":180},
    {"key":"primary_goals","prompt":"What are the most important outcomes you want this project to create?","required":true,"max_duration_seconds":180},
    {"key":"target_audience","prompt":"Describe the audience you most want to reach and what matters to them.","required":true,"max_duration_seconds":180},
    {"key":"brand_voice","prompt":"How should your brand sound and feel? Share any words, styles, or examples we should follow or avoid.","required":true,"max_duration_seconds":180},
    {"key":"success_measures","prompt":"How will you know this project is successful?","required":true,"max_duration_seconds":180},
    {"key":"approvals","prompt":"Who should review and approve work, and what is the best approval process for you?","required":true,"max_duration_seconds":180},
    {"key":"assets_access","prompt":"What brand assets, accounts, or access will you need to provide before work begins?","required":true,"max_duration_seconds":180},
    {"key":"anything_else","prompt":"Is there anything else your Vektiss team should know before getting started?","required":false,"max_duration_seconds":180}
  ]'::jsonb;
BEGIN
  SELECT * INTO _client FROM public.clients WHERE user_id = auth.uid();
  IF _client.id IS NULL THEN RAISE EXCEPTION 'Client workspace not linked'; END IF;

  INSERT INTO public.onboarding_sessions (client_id) VALUES (_client.id)
  ON CONFLICT (client_id) DO NOTHING;
  SELECT * INTO _session FROM public.onboarding_sessions WHERE client_id = _client.id;
  SELECT * INTO _settings FROM public.business_settings WHERE singleton = true LIMIT 1;

  SELECT COALESCE(onboarding_questions, '[]'::jsonb) INTO _questions
  FROM public.onboarding_templates
  WHERE client_type = _client.type
  ORDER BY is_default ASC LIMIT 1;
  IF _questions IS NULL OR jsonb_array_length(_questions) = 0 THEN
    SELECT COALESCE(onboarding_questions, '[]'::jsonb) INTO _questions
    FROM public.onboarding_templates WHERE is_default = true LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'client', jsonb_build_object('id', _client.id, 'name', _client.name, 'type', _client.type, 'status', _client.status),
    'session', to_jsonb(_session),
    'settings', jsonb_build_object('welcome_video_url', _settings.onboarding_welcome_video_url, 'calendly_url', _settings.onboarding_calendly_url),
    'questions', _core || COALESCE(_questions, '[]'::jsonb)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_onboarding_context() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_my_onboarding_session(_session_id uuid, _updates jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _client_id uuid;
  _method text;
  _status text;
  _intro_completed_at timestamptz;
BEGIN
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(_updates) AS key
    WHERE key NOT IN ('method', 'status', 'intro_video_completed_at')
  ) THEN
    RAISE EXCEPTION 'Unsupported onboarding update';
  END IF;

  SELECT client_id INTO _client_id
  FROM public.onboarding_sessions
  WHERE id = _session_id
    AND client_id = public.get_client_id_for_user(auth.uid())
    AND status <> 'completed'
  FOR UPDATE;
  IF _client_id IS NULL THEN RAISE EXCEPTION 'Onboarding session is unavailable'; END IF;

  _method := _updates->>'method';
  _status := _updates->>'status';
  IF _method IS NOT NULL AND _method NOT IN ('on_demand', 'scheduled_call') THEN
    RAISE EXCEPTION 'Invalid onboarding method';
  END IF;
  IF _status IS NOT NULL AND _status NOT IN ('choose_method', 'in_progress') THEN
    RAISE EXCEPTION 'Invalid onboarding status transition';
  END IF;
  IF _updates ? 'intro_video_completed_at' THEN
    _intro_completed_at := (_updates->>'intro_video_completed_at')::timestamptz;
  END IF;

  UPDATE public.onboarding_sessions
  SET method = COALESCE(_method, method),
      status = COALESCE(_status, status),
      intro_video_completed_at = CASE WHEN _updates ? 'intro_video_completed_at' THEN _intro_completed_at ELSE intro_video_completed_at END,
      updated_at = now()
  WHERE id = _session_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_my_onboarding_session(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_my_on_demand_onboarding(_session_id uuid, _approved_summary text, _consent boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _client_id uuid;
BEGIN
  IF NOT _consent THEN RAISE EXCEPTION 'Recording retention consent is required'; END IF;
  SELECT client_id INTO _client_id FROM public.onboarding_sessions
  WHERE id = _session_id AND client_id = public.get_client_id_for_user(auth.uid()) AND status = 'review' FOR UPDATE;
  IF _client_id IS NULL THEN RAISE EXCEPTION 'Onboarding session is not ready for completion'; END IF;
  IF nullif(trim(_approved_summary), '') IS NULL THEN RAISE EXCEPTION 'Approved onboarding summary is required'; END IF;

  UPDATE public.onboarding_sessions SET status = 'completed', approved_summary = _approved_summary,
    recording_consent_at = now(), completed_at = now(), completion_source = 'on_demand', updated_at = now()
  WHERE id = _session_id;
  UPDATE public.clients SET status = 'active', updated_at = now() WHERE id = _client_id;
  UPDATE public.client_onboarding_steps SET completed_at = COALESCE(completed_at, now()) WHERE client_id = _client_id;
  PERFORM public.upsert_client_activity(_client_id, 'onboarding', 'onboarding_completed', _session_id::text,
    'Onboarding completed', 'Your approved onboarding brief is ready.', '{}'::jsonb, now());
  INSERT INTO public.notifications (user_id, title, body, type, link)
  SELECT ur.user_id, 'Client onboarding completed', 'A client completed on-demand onboarding.', 'onboarding', '/admin/clients/' || _client_id
  FROM public.user_roles ur WHERE ur.role IN ('admin', 'ops');
END;
$$;
GRANT EXECUTE ON FUNCTION public.complete_my_on_demand_onboarding(uuid, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_onboarding_from_meeting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _session_id uuid;
BEGIN
  IF NEW.client_id IS NULL OR NEW.summary IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO _session_id FROM public.onboarding_sessions
  WHERE client_id = NEW.client_id AND method = 'scheduled_call' AND status = 'scheduled'
  ORDER BY scheduled_at DESC NULLS LAST LIMIT 1;
  IF _session_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.call_type = 'kickoff' OR NEW.primary_topic ILIKE '%onboard%' OR NEW.summary ILIKE '%onboard%' THEN
    UPDATE public.onboarding_sessions SET status = 'completed', completed_at = now(), completion_source = 'meeting_sync', updated_at = now()
    WHERE id = _session_id;
    UPDATE public.clients SET status = 'active', updated_at = now() WHERE id = NEW.client_id;
    UPDATE public.client_onboarding_steps SET completed_at = COALESCE(completed_at, now()) WHERE client_id = NEW.client_id;
    PERFORM public.upsert_client_activity(NEW.client_id, 'onboarding', 'onboarding_completed', _session_id::text,
      'Onboarding completed', 'Your onboarding call was completed and your workspace is ready.', '{}'::jsonb, now());
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS complete_scheduled_onboarding_from_call ON public.call_intelligence;
CREATE TRIGGER complete_scheduled_onboarding_from_call
AFTER INSERT OR UPDATE OF summary, client_id, call_type, primary_topic ON public.call_intelligence
FOR EACH ROW EXECUTE FUNCTION public.complete_onboarding_from_meeting();

CREATE OR REPLACE FUNCTION public.link_calendly_to_onboarding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.client_id IS NOT NULL AND NEW.event_type = 'calendly' AND NEW.title ILIKE '%onboard%' THEN
    UPDATE public.onboarding_sessions SET method = 'scheduled_call', status = 'scheduled', scheduled_event_id = NEW.id,
      scheduled_at = (NEW.event_date + COALESCE(NEW.start_time, time '00:00')) AT TIME ZONE 'America/Chicago', updated_at = now()
    WHERE client_id = NEW.client_id AND status <> 'completed';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS link_calendly_onboarding_event ON public.calendar_events;
CREATE TRIGGER link_calendly_onboarding_event AFTER INSERT OR UPDATE OF client_id ON public.calendar_events
FOR EACH ROW EXECUTE FUNCTION public.link_calendly_to_onboarding();

CREATE OR REPLACE FUNCTION public.notify_stale_scheduled_onboarding()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _session record;
BEGIN
  FOR _session IN
    SELECT s.id, s.client_id, c.name FROM public.onboarding_sessions s
    JOIN public.clients c ON c.id = s.client_id
    WHERE s.status = 'scheduled' AND s.scheduled_at < now() - interval '24 hours' AND s.stale_alerted_at IS NULL
  LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link)
    SELECT ur.user_id, 'Onboarding call needs review', _session.name || '''s onboarding call has not matched a meeting sync.',
      'onboarding', '/admin/clients/' || _session.client_id
    FROM public.user_roles ur WHERE ur.role IN ('admin', 'ops');
    UPDATE public.onboarding_sessions SET stale_alerted_at = now() WHERE id = _session.id;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'stale-onboarding-call-check';
    PERFORM cron.schedule('stale-onboarding-call-check', '15 * * * *', 'SELECT public.notify_stale_scheduled_onboarding()');
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS update_onboarding_sessions_updated_at ON public.onboarding_sessions;
CREATE TRIGGER update_onboarding_sessions_updated_at BEFORE UPDATE ON public.onboarding_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_onboarding_responses_updated_at ON public.onboarding_responses;
CREATE TRIGGER update_onboarding_responses_updated_at BEFORE UPDATE ON public.onboarding_responses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
