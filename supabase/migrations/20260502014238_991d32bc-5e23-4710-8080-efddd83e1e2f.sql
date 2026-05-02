CREATE TABLE public.ai_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'global',
  scope_id UUID,
  category TEXT,
  rule TEXT NOT NULL,
  reason TEXT,
  source_decision_id UUID REFERENCES public.ai_decision_queue(id) ON DELETE SET NULL,
  created_by UUID,
  active BOOLEAN NOT NULL DEFAULT true,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_preferences_active ON public.ai_preferences(active) WHERE active = true;
CREATE INDEX idx_ai_preferences_scope ON public.ai_preferences(scope, scope_id, category);

ALTER TABLE public.ai_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ai preferences"
ON public.ai_preferences FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Ops view ai preferences"
ON public.ai_preferences FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'ops'));

CREATE POLICY "Service role full access ai preferences"
ON public.ai_preferences FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_ai_preferences_updated_at
BEFORE UPDATE ON public.ai_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();