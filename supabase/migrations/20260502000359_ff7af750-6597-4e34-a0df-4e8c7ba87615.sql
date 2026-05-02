-- Add client linkage and report type to market_intelligence
ALTER TABLE public.market_intelligence
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS report_type text NOT NULL DEFAULT 'agency';

CREATE INDEX IF NOT EXISTS idx_market_intel_client_id ON public.market_intelligence(client_id);
CREATE INDEX IF NOT EXISTS idx_market_intel_report_type ON public.market_intelligence(report_type);

-- Link tasks back to the insight that spawned them
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS source_market_insight_id uuid;

CREATE INDEX IF NOT EXISTS idx_tasks_source_market_insight ON public.tasks(source_market_insight_id);

-- Enable RLS and add policies for market_intelligence
ALTER TABLE public.market_intelligence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage market intelligence" ON public.market_intelligence;
CREATE POLICY "Admins manage market intelligence"
  ON public.market_intelligence
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Ops view market intelligence" ON public.market_intelligence;
CREATE POLICY "Ops view market intelligence"
  ON public.market_intelligence
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'ops'::app_role));

DROP POLICY IF EXISTS "Clients view own market intelligence" ON public.market_intelligence;
CREATE POLICY "Clients view own market intelligence"
  ON public.market_intelligence
  FOR SELECT
  TO authenticated
  USING (client_id IS NOT NULL AND client_id = get_client_id_for_user(auth.uid()));

DROP POLICY IF EXISTS "Service role manages market intelligence" ON public.market_intelligence;
CREATE POLICY "Service role manages market intelligence"
  ON public.market_intelligence
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');