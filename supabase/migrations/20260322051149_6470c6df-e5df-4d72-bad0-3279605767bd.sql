
-- Create proposal_views log table
CREATE TABLE public.proposal_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text
);

-- Add view tracking columns to proposals
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz;

-- RLS for proposal_views
ALTER TABLE public.proposal_views ENABLE ROW LEVEL SECURITY;

-- Admins can read all views
CREATE POLICY "Admins can view proposal views"
  ON public.proposal_views FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert views (edge function)
CREATE POLICY "Service role can insert proposal views"
  ON public.proposal_views FOR INSERT
  TO public
  WITH CHECK (auth.role() = 'service_role'::text);

-- Service role can read views
CREATE POLICY "Service role can read proposal views"
  ON public.proposal_views FOR SELECT
  TO public
  USING (auth.role() = 'service_role'::text);
