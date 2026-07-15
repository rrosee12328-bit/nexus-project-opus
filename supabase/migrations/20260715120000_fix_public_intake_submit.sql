-- Public intake submissions need token context at submit time. Direct anonymous
-- inserts cannot reliably satisfy RLS after intake_forms SELECT access was
-- moved behind token-scoped RPCs, so submission also goes through an RPC.

CREATE TABLE IF NOT EXISTS public.intake_forms (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token text NOT NULL UNIQUE,
  form_type text NOT NULL DEFAULT 'business_media',
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  recipient_name text,
  recipient_email text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','viewed','completed')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.intake_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  intake_form_id uuid NOT NULL REFERENCES public.intake_forms(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  business_name text,
  contact_name text,
  email text,
  phone text,
  website text,
  social_accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  inspirations jsonb NOT NULL DEFAULT '[]'::jsonb,
  visual_style_notes text,
  company_description text,
  target_demographic text,
  competitors text,
  brand_voice text,
  brand_guidelines text,
  differentiators text,
  active_platforms text,
  expansion_platforms text,
  primary_goals text,
  dream_deliverables text,
  turnaround_expectations text,
  approval_process text,
  success_kpis text,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intake_forms_token ON public.intake_forms(token);
CREATE INDEX IF NOT EXISTS idx_intake_forms_client ON public.intake_forms(client_id);
CREATE INDEX IF NOT EXISTS idx_intake_forms_type ON public.intake_forms(form_type);
CREATE INDEX IF NOT EXISTS idx_intake_responses_form ON public.intake_responses(intake_form_id);
CREATE INDEX IF NOT EXISTS idx_intake_responses_client ON public.intake_responses(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intake_forms TO authenticated;
GRANT ALL ON public.intake_forms TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intake_responses TO authenticated;
GRANT ALL ON public.intake_responses TO service_role;

ALTER TABLE public.intake_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view intake form by token" ON public.intake_forms;
DROP POLICY IF EXISTS "Public can mark intake as viewed" ON public.intake_forms;
DROP POLICY IF EXISTS "Admins and ops manage intake forms" ON public.intake_forms;
CREATE POLICY "Admins and ops manage intake forms"
  ON public.intake_forms FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));

DROP POLICY IF EXISTS "Admins and ops view intake responses" ON public.intake_responses;
DROP POLICY IF EXISTS "Admins and ops manage intake responses" ON public.intake_responses;
DROP POLICY IF EXISTS "Clients view their own intake responses" ON public.intake_responses;
CREATE POLICY "Admins and ops view intake responses"
  ON public.intake_responses FOR SELECT
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));
CREATE POLICY "Admins and ops manage intake responses"
  ON public.intake_responses FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));
CREATE POLICY "Clients view their own intake responses"
  ON public.intake_responses FOR SELECT
  USING (client_id = public.get_client_id_for_user(auth.uid()));

DO $$
BEGIN
  IF to_regprocedure('public.update_updated_at_column()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS update_intake_forms_updated_at ON public.intake_forms;
    CREATE TRIGGER update_intake_forms_updated_at
      BEFORE UPDATE ON public.intake_forms
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

    DROP TRIGGER IF EXISTS update_intake_responses_updated_at ON public.intake_responses;
    CREATE TRIGGER update_intake_responses_updated_at
      BEFORE UPDATE ON public.intake_responses
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

DROP POLICY IF EXISTS "Public can submit intake response with valid token"
  ON public.intake_responses;

ALTER TABLE public.intake_forms
  ADD COLUMN IF NOT EXISTS form_type text NOT NULL DEFAULT 'business_media';

ALTER TABLE public.intake_responses
  ADD COLUMN IF NOT EXISTS response_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.get_intake_form_by_token(_token text)
RETURNS SETOF public.intake_forms
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.intake_forms WHERE token = _token LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_intake_form_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_intake_form_by_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_intake_viewed(_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.intake_forms
     SET status = 'viewed', viewed_at = COALESCE(viewed_at, now())
   WHERE token = _token AND status = 'sent';
$$;
REVOKE ALL ON FUNCTION public.mark_intake_viewed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_intake_viewed(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_intake_response(_token text, _response jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _form public.intake_forms%ROWTYPE;
  _response_id uuid;
BEGIN
  SELECT *
    INTO _form
    FROM public.intake_forms
   WHERE token = _token
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid intake link';
  END IF;

  IF _form.expires_at IS NOT NULL AND _form.expires_at <= now() THEN
    RAISE EXCEPTION 'This intake link has expired';
  END IF;

  IF _form.status = 'completed' THEN
    RAISE EXCEPTION 'This intake form has already been submitted';
  END IF;

  INSERT INTO public.intake_responses (
    intake_form_id,
    client_id,
    business_name,
    contact_name,
    email,
    phone,
    website,
    social_accounts,
    inspirations,
    visual_style_notes,
    company_description,
    target_demographic,
    competitors,
    brand_voice,
    brand_guidelines,
    differentiators,
    active_platforms,
    expansion_platforms,
    primary_goals,
    dream_deliverables,
    turnaround_expectations,
    approval_process,
    success_kpis,
    response_payload
  )
  VALUES (
    _form.id,
    _form.client_id,
    NULLIF(BTRIM(_response ->> 'business_name'), ''),
    NULLIF(BTRIM(_response ->> 'contact_name'), ''),
    NULLIF(BTRIM(_response ->> 'email'), ''),
    NULLIF(BTRIM(_response ->> 'phone'), ''),
    NULLIF(BTRIM(_response ->> 'website'), ''),
    CASE
      WHEN jsonb_typeof(_response -> 'social_accounts') = 'array'
      THEN _response -> 'social_accounts'
      ELSE '[]'::jsonb
    END,
    CASE
      WHEN jsonb_typeof(_response -> 'inspirations') = 'array'
      THEN _response -> 'inspirations'
      ELSE '[]'::jsonb
    END,
    NULLIF(BTRIM(_response ->> 'visual_style_notes'), ''),
    NULLIF(BTRIM(_response ->> 'company_description'), ''),
    NULLIF(BTRIM(_response ->> 'target_demographic'), ''),
    NULLIF(BTRIM(_response ->> 'competitors'), ''),
    NULLIF(BTRIM(_response ->> 'brand_voice'), ''),
    NULLIF(BTRIM(_response ->> 'brand_guidelines'), ''),
    NULLIF(BTRIM(_response ->> 'differentiators'), ''),
    NULLIF(BTRIM(_response ->> 'active_platforms'), ''),
    NULLIF(BTRIM(_response ->> 'expansion_platforms'), ''),
    NULLIF(BTRIM(_response ->> 'primary_goals'), ''),
    NULLIF(BTRIM(_response ->> 'dream_deliverables'), ''),
    NULLIF(BTRIM(_response ->> 'turnaround_expectations'), ''),
    NULLIF(BTRIM(_response ->> 'approval_process'), ''),
    NULLIF(BTRIM(_response ->> 'success_kpis'), ''),
    COALESCE(_response -> 'response_payload', '{}'::jsonb)
  )
  RETURNING id INTO _response_id;

  RETURN _response_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_intake_response(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_intake_response(text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_on_intake_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_id uuid;
  _who text;
BEGIN
  UPDATE public.intake_forms
     SET status = 'completed', completed_at = COALESCE(completed_at, now())
   WHERE id = NEW.intake_form_id;

  IF NEW.client_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'clients'
       AND column_name = 'last_contact_date'
  ) THEN
    UPDATE public.clients SET last_contact_date = CURRENT_DATE WHERE id = NEW.client_id;
  END IF;

  _who := COALESCE(NEW.business_name, NEW.contact_name, NEW.email, 'a prospect');

  IF to_regclass('public.notifications') IS NOT NULL AND to_regclass('public.user_roles') IS NOT NULL THEN
    FOR _admin_id IN SELECT user_id FROM public.user_roles WHERE role = 'admin'::app_role LOOP
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (
        _admin_id,
        'New intake response',
        _who || ' just submitted an intake form.',
        'message',
        '/admin/intakes'
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_intake_submission ON public.intake_responses;
CREATE TRIGGER trg_notify_on_intake_submission
  AFTER INSERT ON public.intake_responses
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_intake_submission();
