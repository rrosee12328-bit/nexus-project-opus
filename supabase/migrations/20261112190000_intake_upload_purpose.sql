ALTER TABLE public.intake_uploads ADD COLUMN purpose text CHECK (purpose IS NULL OR length(trim(purpose)) BETWEEN 1 AND 500);
GRANT UPDATE (purpose) ON public.intake_uploads TO authenticated;
CREATE POLICY "Staff label intake uploads" ON public.intake_uploads FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));
