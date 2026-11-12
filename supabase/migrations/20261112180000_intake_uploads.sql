CREATE TABLE public.intake_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_form_id uuid NOT NULL REFERENCES public.intake_forms(id),
  category text NOT NULL CHECK (category IN ('logo','photos','materials')),
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.intake_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.intake_uploads FROM anon, authenticated;
GRANT SELECT ON public.intake_uploads TO authenticated;
CREATE POLICY "Staff read intake uploads" ON public.intake_uploads FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'));

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('intake-materials','intake-materials',false,10485760,ARRAY['image/png','image/jpeg','image/webp','image/gif','application/pdf'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Staff read private intake materials" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='intake-materials' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops')));

CREATE FUNCTION public.reserve_intake_upload(p_token text,p_category text,p_name text,p_size integer,p_extension text)
RETURNS public.intake_uploads LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f public.intake_forms; u public.intake_uploads; upload_id uuid := gen_random_uuid();
BEGIN
  SELECT * INTO f FROM public.intake_forms WHERE token=p_token FOR UPDATE;
  IF NOT FOUND OR f.form_type <> 'website_development' OR f.status='completed' OR (f.expires_at IS NOT NULL AND f.expires_at<=now()) THEN
    RAISE EXCEPTION 'This upload link is unavailable';
  END IF;
  IF p_category NOT IN ('logo','photos','materials') OR length(p_name) NOT BETWEEN 1 AND 180 OR p_extension NOT IN ('png','jpg','jpeg','webp','gif','pdf') THEN RAISE EXCEPTION 'Invalid file'; END IF;
  IF (SELECT count(*) FROM public.intake_uploads WHERE intake_form_id=f.id)>=20 THEN RAISE EXCEPTION 'Maximum 20 files per questionnaire'; END IF;
  INSERT INTO public.intake_uploads(id,intake_form_id,category,file_name,storage_path,size_bytes)
  VALUES(upload_id,f.id,p_category,p_name,f.id::text||'/'||upload_id::text||'.'||p_extension,p_size) RETURNING * INTO u;
  RETURN u;
END $$;
REVOKE ALL ON FUNCTION public.reserve_intake_upload(text,text,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_intake_upload(text,text,text,integer,text) TO service_role;
