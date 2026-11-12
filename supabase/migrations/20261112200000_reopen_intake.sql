CREATE OR REPLACE FUNCTION public.reopen_intake_form(p_id uuid)
RETURNS public.intake_forms LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f public.intake_forms;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops')) OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;
  UPDATE public.intake_forms SET status='sent', completed_at=NULL, viewed_at=NULL,
    expires_at=greatest(coalesce(expires_at,now()),now()+interval '60 days')
    WHERE id=p_id RETURNING * INTO f;
  IF NOT FOUND THEN RAISE EXCEPTION 'Form not found'; END IF;
  RETURN f;
END $$;
REVOKE ALL ON FUNCTION public.reopen_intake_form(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reopen_intake_form(uuid) TO authenticated;
