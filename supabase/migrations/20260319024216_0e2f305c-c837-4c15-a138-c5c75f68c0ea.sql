
-- Create storage bucket for client assets
INSERT INTO storage.buckets (id, name, public) VALUES ('client-assets', 'client-assets', true);

-- Assets metadata table
CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  file_type text,
  category text NOT NULL DEFAULT 'upload',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

-- Admins full access
CREATE POLICY "Admins can manage assets"
  ON public.assets FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Clients can view their own assets
CREATE POLICY "Clients can view their own assets"
  ON public.assets FOR SELECT
  USING (client_id = get_client_id_for_user(auth.uid()));

-- Clients can upload assets
CREATE POLICY "Clients can insert their own assets"
  ON public.assets FOR INSERT
  WITH CHECK (client_id = get_client_id_for_user(auth.uid()) AND uploaded_by = auth.uid());

-- Clients can delete their own uploads
CREATE POLICY "Clients can delete their own assets"
  ON public.assets FOR DELETE
  USING (client_id = get_client_id_for_user(auth.uid()) AND uploaded_by = auth.uid());

-- Ops can view
CREATE POLICY "Ops can view assets"
  ON public.assets FOR SELECT
  USING (has_role(auth.uid(), 'ops'::app_role));

-- Storage RLS: clients can upload to their folder
CREATE POLICY "Authenticated users can upload assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'client-assets');

CREATE POLICY "Authenticated users can view assets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'client-assets');

CREATE POLICY "Admins can delete assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'client-assets' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can delete own uploaded assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'client-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
