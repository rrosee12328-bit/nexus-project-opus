CREATE TABLE public.client_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_name text NOT NULL,
 title text NOT NULL,
 content jsonb NOT NULL,
 share_token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32),'hex'),
 published boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_reports FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.client_reports TO authenticated;
CREATE POLICY "Admins manage report pages" ON public.client_reports FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE FUNCTION public.read_client_report(p_token text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('company_name',company_name,'title',title,'content',content)
 FROM public.client_reports WHERE share_token=p_token AND published=true;
$$;
REVOKE ALL ON FUNCTION public.read_client_report(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_client_report(text) TO anon,authenticated;
