-- Create intake links through an authenticated RPC so the admin UI is not
-- blocked by table-level RLS policy drift.

CREATE OR REPLACE FUNCTION public.create_intake_form(
  _token text,
  _form_type text DEFAULT 'business_media',
  _client_id uuid DEFAULT NULL,
  _recipient_name text DEFAULT NULL,
  _recipient_email text DEFAULT NULL
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

  IF _form_type NOT IN ('business_media', 'funding_app') THEN
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

REVOKE ALL ON FUNCTION public.create_intake_form(text, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_intake_form(text, text, uuid, text, text) TO authenticated;
