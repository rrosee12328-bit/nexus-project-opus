ALTER TABLE public.proposals
ADD COLUMN IF NOT EXISTS billing_start_date date;

COMMENT ON COLUMN public.proposals.billing_start_date IS
  'Optional first billing date for recurring proposal subscriptions.';

UPDATE public.proposals
SET billing_start_date = DATE '2026-09-11'
WHERE id = '40244aad-32f8-46ce-94a3-f39b2f09dc56';
