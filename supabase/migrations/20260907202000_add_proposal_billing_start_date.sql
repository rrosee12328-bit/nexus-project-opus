ALTER TABLE public.proposals
ADD COLUMN IF NOT EXISTS billing_start_date date;

COMMENT ON COLUMN public.proposals.billing_start_date IS
  'Optional first billing date for recurring proposal subscriptions.';
