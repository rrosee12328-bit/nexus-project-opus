-- Allow admins to generate Meta ad account setup intake links through the
-- existing intake link RPC.

DROP FUNCTION IF EXISTS public.create_intake_form(text, text, uuid, text, text);

CREATE OR REPLACE FUNCTION public.create_intake_form(
  _client_id uuid DEFAULT NULL,
  _form_type text DEFAULT 'business_media',
  _recipient_email text DEFAULT NULL,
  _recipient_name text DEFAULT NULL,
  _token text DEFAULT NULL
)
RETURNS SETOF public.intake_forms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NULLIF(BTRIM(COALESCE(_token, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Token is required';
  END IF;

  IF _form_type NOT IN ('business_media', 'funding_app', 'meta_ad_account') THEN
    RAISE EXCEPTION 'Invalid intake form type';
  END IF;

  RETURN QUERY
  INSERT INTO public.intake_forms (
    token,
    form_type,
    client_id,
    recipient_name,
    recipient_email,
    created_by
  )
  VALUES (
    _token,
    _form_type,
    _client_id,
    NULLIF(BTRIM(_recipient_name), ''),
    NULLIF(BTRIM(_recipient_email), ''),
    auth.uid()
  )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.create_intake_form(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_intake_form(uuid, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
