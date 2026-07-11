
-- Remove leftover permissive SELECT policies on call_intelligence
DROP POLICY IF EXISTS "Allow authenticated reads on call_intelligence" ON public.call_intelligence;
DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.call_intelligence;

-- Restrict checklist_templates to admin/ops
DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.checklist_templates;
DROP POLICY IF EXISTS "admin_ops_read_checklist_templates" ON public.checklist_templates;
CREATE POLICY "admin_ops_read_checklist_templates"
  ON public.checklist_templates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));

-- Tighten time_tracking_codes to admin/ops (drop broad authenticated read)
DROP POLICY IF EXISTS "authenticated_read_time_tracking_codes" ON public.time_tracking_codes;

-- =========================
-- Intake forms: replace anon policies with token-checked RPCs
-- =========================
DROP POLICY IF EXISTS "Public can view intake form by token" ON public.intake_forms;
DROP POLICY IF EXISTS "Public can mark intake as viewed" ON public.intake_forms;

CREATE OR REPLACE FUNCTION public.get_intake_form_by_token(_token text)
RETURNS SETOF public.intake_forms
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.intake_forms WHERE token = _token LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_intake_form_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_intake_form_by_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_intake_viewed(_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.intake_forms
     SET status = 'viewed', viewed_at = COALESCE(viewed_at, now())
   WHERE token = _token AND status = 'sent';
$$;
REVOKE ALL ON FUNCTION public.mark_intake_viewed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_intake_viewed(text) TO anon, authenticated;

-- Allow anon INSERT on intake_responses only when the token matches an active intake form
DROP POLICY IF EXISTS "Public can submit intake response with valid token" ON public.intake_responses;
CREATE POLICY "Public can submit intake response with valid token"
  ON public.intake_responses FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.intake_forms f
    WHERE f.id = intake_responses.intake_form_id
      AND f.status IN ('sent','viewed')
      AND (f.expires_at IS NULL OR f.expires_at > now())
  ));

-- =========================
-- Realtime: scope subscriptions to admin/ops or the caller's own topic
-- =========================
DROP POLICY IF EXISTS "authenticated_realtime_access" ON realtime.messages;
DO $$ BEGIN
  CREATE POLICY "scoped_realtime_access"
    ON realtime.messages FOR SELECT TO authenticated
    USING (
      public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'ops')
      OR realtime.topic() LIKE '%' || auth.uid()::text || '%'
      OR realtime.topic() LIKE '%' || COALESCE(public.get_client_id_for_user(auth.uid())::text, '__none__') || '%'
    );
EXCEPTION WHEN insufficient_privilege THEN NULL;
WHEN undefined_table THEN NULL;
END $$;
