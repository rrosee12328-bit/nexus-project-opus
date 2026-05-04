
CREATE TABLE IF NOT EXISTS public.ms_outlook_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  ms_user_id text,
  ms_email text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ms_outlook_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own MS token"
  ON public.ms_outlook_tokens FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users delete own MS token"
  ON public.ms_outlook_tokens FOR DELETE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_ms_outlook_tokens_updated_at
  BEFORE UPDATE ON public.ms_outlook_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS outlook_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_outlook_user
  ON public.calendar_events(outlook_user_id);
