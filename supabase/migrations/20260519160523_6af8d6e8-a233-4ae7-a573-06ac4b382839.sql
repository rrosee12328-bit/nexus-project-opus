
ALTER TABLE public.call_intelligence
  ADD COLUMN IF NOT EXISTS primary_topic text,
  ADD COLUMN IF NOT EXISTS topic_confidence numeric,
  ADD COLUMN IF NOT EXISTS topic_reason text,
  ADD COLUMN IF NOT EXISTS topic_scored_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_call_intelligence_primary_topic
  ON public.call_intelligence (primary_topic);
