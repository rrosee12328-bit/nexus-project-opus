
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS follow_up_start date,
  ADD COLUMN IF NOT EXISTS follow_up_end date,
  ADD COLUMN IF NOT EXISTS last_contact_date date,
  ADD COLUMN IF NOT EXISTS lead_source text;
