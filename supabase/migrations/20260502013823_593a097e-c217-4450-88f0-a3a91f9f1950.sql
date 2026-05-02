CREATE TABLE public.brain_state_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  summary_md TEXT NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_brain_state_snapshots_date ON public.brain_state_snapshots(snapshot_date DESC);

ALTER TABLE public.brain_state_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and ops can view brain snapshots"
ON public.brain_state_snapshots FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'ops'));