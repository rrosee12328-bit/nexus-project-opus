-- The production project can predate the original bucket migration. Ensure the
-- shared client asset bucket exists and is private before contract PDFs upload.
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-assets', 'client-assets', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Authenticated users can upload assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own uploaded assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload client assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view client assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own uploads" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage all client assets" ON storage.objects;
DROP POLICY IF EXISTS "Clients can view own assets" ON storage.objects;
DROP POLICY IF EXISTS "Clients can upload own assets" ON storage.objects;
DROP POLICY IF EXISTS "Clients can delete own assets" ON storage.objects;
DROP POLICY IF EXISTS "Ops can view client assets" ON storage.objects;

CREATE POLICY "Admins can manage all client assets"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'client-assets'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'client-assets'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Ops can view client assets"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'client-assets'
  AND public.has_role(auth.uid(), 'ops'::public.app_role)
);

CREATE POLICY "Clients can view own assets"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'client-assets'
  AND (storage.foldername(name))[1] = public.get_client_id_for_user(auth.uid())::text
);

CREATE POLICY "Clients can upload own assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'client-assets'
  AND (storage.foldername(name))[1] = public.get_client_id_for_user(auth.uid())::text
);

CREATE POLICY "Clients can delete own assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'client-assets'
  AND (storage.foldername(name))[1] = public.get_client_id_for_user(auth.uid())::text
);
