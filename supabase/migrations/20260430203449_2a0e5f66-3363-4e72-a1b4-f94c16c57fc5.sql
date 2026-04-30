ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS billable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoiced_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS hourly_invoice_id uuid,
  ADD COLUMN IF NOT EXISTS hourly_rate numeric,
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text;

CREATE INDEX IF NOT EXISTS idx_calendar_events_client_billable
  ON public.calendar_events (client_id, event_date)
  WHERE invoiced_at IS NULL;