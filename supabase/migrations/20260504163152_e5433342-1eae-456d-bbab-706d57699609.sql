ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS current_status_links jsonb NOT NULL DEFAULT '[]'::jsonb;