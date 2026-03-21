
-- 1. Make client-assets bucket private (no anonymous public reads)
UPDATE storage.buckets SET public = false WHERE id = 'client-assets';

-- 2. Drop all existing policies on storage.objects for client-assets
DROP POLICY IF EXISTS "Authenticated users can upload client assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view client assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own uploads" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage all client assets" ON storage.objects;
DROP POLICY IF EXISTS "Clients can view own assets" ON storage.objects;
DROP POLICY IF EXISTS "Clients can upload own assets" ON storage.objects;
DROP POLICY IF EXISTS "Clients can delete own assets" ON storage.objects;
DROP POLICY IF EXISTS "Ops can view client assets" ON storage.objects;

-- 3. Admin full access
CREATE POLICY "Admins can manage all client assets"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'client-assets'
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  bucket_id = 'client-assets'
  AND public.has_role(auth.uid(), 'admin')
);

-- 4. Ops read-only
CREATE POLICY "Ops can view client assets"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-assets'
  AND public.has_role(auth.uid(), 'ops')
);

-- 5. Clients can SELECT objects under their own client_id folder
CREATE POLICY "Clients can view own assets"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-assets'
  AND (storage.foldername(name))[1] = public.get_client_id_for_user(auth.uid())::text
);

-- 6. Clients can INSERT objects under their own client_id folder
CREATE POLICY "Clients can upload own assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-assets'
  AND (storage.foldername(name))[1] = public.get_client_id_for_user(auth.uid())::text
);

-- 7. Clients can DELETE objects under their own client_id folder
CREATE POLICY "Clients can delete own assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-assets'
  AND (storage.foldername(name))[1] = public.get_client_id_for_user(auth.uid())::text
);

-- 8. Fix get_user_role to use deterministic precedence (admin > ops > client)
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY
    CASE role
      WHEN 'admin' THEN 1
      WHEN 'ops' THEN 2
      WHEN 'client' THEN 3
    END
  LIMIT 1
$$;
