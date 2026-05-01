
CREATE TABLE public.market_intelligence_errors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  error_message TEXT NOT NULL,
  stage TEXT,
  raw_payload JSONB,
  trigger_source TEXT DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.market_intelligence_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view market intelligence errors"
ON public.market_intelligence_errors
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.market_intelligence_errors;
ALTER TABLE public.market_intelligence_errors REPLICA IDENTITY FULL;
