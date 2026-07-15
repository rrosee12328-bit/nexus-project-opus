-- Keep the currently deployed admin UI working while newer builds create
-- intake links through public.create_intake_form().

DROP POLICY IF EXISTS "Authenticated users create own intake forms" ON public.intake_forms;
CREATE POLICY "Authenticated users create own intake forms"
  ON public.intake_forms FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated users read own intake forms" ON public.intake_forms;
CREATE POLICY "Authenticated users read own intake forms"
  ON public.intake_forms FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND created_by = auth.uid());

NOTIFY pgrst, 'reload schema';
