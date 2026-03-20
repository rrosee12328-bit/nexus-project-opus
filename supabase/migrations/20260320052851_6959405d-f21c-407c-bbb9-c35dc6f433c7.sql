
CREATE TABLE public.client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'note',
  title text NOT NULL,
  content text,
  meeting_date timestamptz,
  attendees text[] NOT NULL DEFAULT '{}',
  url text,
  file_path text,
  status text DEFAULT 'pending',
  due_date date,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_notes_client ON public.client_notes(client_id, created_at DESC);
CREATE INDEX idx_client_notes_type ON public.client_notes(client_id, type);

ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage client notes"
  ON public.client_notes FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Ops can view client notes"
  ON public.client_notes FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'ops'::app_role));

CREATE TRIGGER update_client_notes_updated_at
  BEFORE UPDATE ON public.client_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
