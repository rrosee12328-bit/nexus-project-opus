
-- Table to track reminder emails sent, preventing duplicates within 24h windows
CREATE TABLE public.reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_type text NOT NULL, -- 'unread_message', 'task_review', 'project_review', 'unpaid_invoice'
  reference_id text NOT NULL, -- the ID of the item (message client_id, task id, project id, client id)
  recipient_email text NOT NULL,
  recipient_user_id uuid,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient lookups
CREATE INDEX idx_reminder_log_lookup ON public.reminder_log (reminder_type, reference_id, sent_at DESC);

ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage reminder log"
  ON public.reminder_log FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY "Admins can view reminder log"
  ON public.reminder_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));
