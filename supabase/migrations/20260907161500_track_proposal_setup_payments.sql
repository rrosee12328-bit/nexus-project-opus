ALTER TABLE public.proposals
ADD COLUMN IF NOT EXISTS setup_paid numeric NOT NULL DEFAULT 0
CHECK (setup_paid >= 0);

UPDATE public.proposals p
SET setup_paid = LEAST(COALESCE(c.setup_paid, 0), COALESCE(p.setup_fee, 0))
FROM public.clients c
WHERE p.client_id = c.id
  AND COALESCE(p.setup_paid, 0) = 0
  AND COALESCE(c.setup_paid, 0) > 0;
