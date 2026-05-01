ALTER TABLE call_intelligence
  ADD COLUMN IF NOT EXISTS summary_original text,
  ADD COLUMN IF NOT EXISTS summary_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS summary_edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS summary_edited_by uuid,
  ADD COLUMN IF NOT EXISTS flagged_amounts jsonb NOT NULL DEFAULT '[]'::jsonb;

DROP POLICY IF EXISTS "Admins can update call intelligence" ON call_intelligence;
CREATE POLICY "Admins can update call intelligence"
  ON call_intelligence FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));