
CREATE TABLE public.admin_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  summary text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_activity_log_user ON public.admin_activity_log(user_id, created_at DESC);
CREATE INDEX idx_admin_activity_log_entity ON public.admin_activity_log(entity_type, created_at DESC);

ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all activity"
  ON public.admin_activity_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert own activity"
  ON public.admin_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access"
  ON public.admin_activity_log FOR ALL
  TO public
  USING (auth.role() = 'service_role'::text);
