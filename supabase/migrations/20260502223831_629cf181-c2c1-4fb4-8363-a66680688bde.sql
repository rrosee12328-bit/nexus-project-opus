ALTER TABLE public.ai_decision_queue
  ADD COLUMN IF NOT EXISTS snooze_until timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_ai_decision_queue_pending_snooze
  ON public.ai_decision_queue (status, snooze_until)
  WHERE status = 'pending';