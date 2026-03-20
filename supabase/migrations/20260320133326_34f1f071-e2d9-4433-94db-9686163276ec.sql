
-- Project attachments table for docs/links per project
CREATE TABLE public.project_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text NOT NULL DEFAULT 'link',
  url text,
  file_path text,
  file_name text,
  file_size bigint,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_attachments ENABLE ROW LEVEL SECURITY;

-- Admins full access
CREATE POLICY "Admins can manage project attachments"
  ON public.project_attachments FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Ops can view
CREATE POLICY "Ops can view project attachments"
  ON public.project_attachments FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'ops'));

-- Clients can view their own project attachments
CREATE POLICY "Clients can view own project attachments"
  ON public.project_attachments FOR SELECT
  TO authenticated
  USING (project_id IN (
    SELECT id FROM public.projects WHERE client_id = get_client_id_for_user(auth.uid())
  ));
