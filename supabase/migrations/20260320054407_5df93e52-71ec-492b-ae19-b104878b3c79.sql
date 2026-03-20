
-- Task attachments: links and files attached to tasks
CREATE TABLE public.task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'link' CHECK (type IN ('link', 'file')),
  title text NOT NULL,
  url text,
  file_path text,
  file_name text,
  file_size bigint,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage task attachments"
  ON public.task_attachments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Ops can manage task attachments"
  ON public.task_attachments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ops'));

-- Storage bucket for task files
INSERT INTO storage.buckets (id, name, public) VALUES ('task-attachments', 'task-attachments', false);

-- Storage policies
CREATE POLICY "Admins can manage task attachment files"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'task-attachments' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'task-attachments' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Ops can manage task attachment files"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'task-attachments' AND public.has_role(auth.uid(), 'ops'))
  WITH CHECK (bucket_id = 'task-attachments' AND public.has_role(auth.uid(), 'ops'));
