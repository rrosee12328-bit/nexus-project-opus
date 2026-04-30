-- Extend timesheets to track billing state
ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS invoiced_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text,
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(10,2);

CREATE INDEX IF NOT EXISTS idx_timesheets_invoiced_at ON public.timesheets(invoiced_at);
CREATE INDEX IF NOT EXISTS idx_timesheets_stripe_invoice_id ON public.timesheets(stripe_invoice_id);

-- Hourly invoices header table
CREATE TABLE IF NOT EXISTS public.hourly_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  stripe_invoice_id text UNIQUE,
  stripe_customer_id text,
  hosted_invoice_url text,
  invoice_pdf text,
  invoice_number text,
  status text NOT NULL DEFAULT 'draft', -- draft | open | paid | void | uncollectible
  hourly_rate numeric(10,2) NOT NULL,
  total_hours numeric(10,2) NOT NULL DEFAULT 0,
  amount_due numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  period_start date,
  period_end date,
  notes text,
  created_by uuid NOT NULL,
  finalized_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hourly_invoices_client ON public.hourly_invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_hourly_invoices_status ON public.hourly_invoices(status);

ALTER TABLE public.hourly_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage hourly invoices"
  ON public.hourly_invoices FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Ops view hourly invoices"
  ON public.hourly_invoices FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'ops'::app_role));

CREATE POLICY "Service role full access hourly invoices"
  ON public.hourly_invoices FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Clients view own hourly invoices"
  ON public.hourly_invoices FOR SELECT TO authenticated
  USING (client_id = get_client_id_for_user(auth.uid()));

CREATE TRIGGER update_hourly_invoices_updated_at
  BEFORE UPDATE ON public.hourly_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link timesheets to hourly_invoices (optional FK)
ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS hourly_invoice_id uuid REFERENCES public.hourly_invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_timesheets_hourly_invoice ON public.timesheets(hourly_invoice_id);