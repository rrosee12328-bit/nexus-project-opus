ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS current_status_recap text,
  ADD COLUMN IF NOT EXISTS current_status_updated_at timestamptz;