
-- Add outlook_event_id column for dedup
ALTER TABLE public.calendar_events
ADD COLUMN IF NOT EXISTS outlook_event_id text UNIQUE;

-- Enable pg_cron and pg_net for scheduled sync
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
