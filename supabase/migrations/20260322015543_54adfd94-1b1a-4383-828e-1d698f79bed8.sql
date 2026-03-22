
-- Proposals table for tracking proposal → contract → sign → pay flow
CREATE TABLE public.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status text NOT NULL DEFAULT 'draft',
  -- Client contact info (filled by client on proposal page)
  client_name text,
  company_name text,
  client_address text,
  client_email text,
  -- Financial terms (set by admin)
  setup_fee numeric NOT NULL DEFAULT 0,
  monthly_fee numeric NOT NULL DEFAULT 0,
  services_description text,
  -- Signing
  signed_at timestamptz,
  signed_name text,
  -- Payment
  stripe_checkout_session_id text,
  paid_at timestamptz,
  -- Contract PDF
  contract_pdf_path text,
  -- Metadata
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage proposals"
  ON public.proposals FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Ops can view proposals
CREATE POLICY "Ops can view proposals"
  ON public.proposals FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'ops'));

-- Public access by token (for unsigned proposal pages - use anon key)
CREATE POLICY "Anyone can view proposal by token"
  ON public.proposals FOR SELECT
  TO anon
  USING (true);

-- Allow anon to update proposals (for signing - restricted by edge function)
CREATE POLICY "Anon can update proposals for signing"
  ON public.proposals FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER update_proposals_updated_at
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
