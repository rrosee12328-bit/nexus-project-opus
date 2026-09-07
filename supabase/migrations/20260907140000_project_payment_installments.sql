ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS project_deposit_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS project_final_invoice_id text;

ALTER TABLE public.hourly_invoices
  ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hourly_invoices_proposal_id
  ON public.hourly_invoices(proposal_id);
