-- Public intake submissions need token context at submit time. Direct anonymous
-- inserts cannot reliably satisfy RLS after intake_forms SELECT access was
-- moved behind token-scoped RPCs, so submission also goes through an RPC.

DROP POLICY IF EXISTS "Public can submit intake response with valid token"
  ON public.intake_responses;

ALTER TABLE public.intake_forms
  ADD COLUMN IF NOT EXISTS form_type text NOT NULL DEFAULT 'business_media';

ALTER TABLE public.intake_responses
  ADD COLUMN IF NOT EXISTS response_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

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
