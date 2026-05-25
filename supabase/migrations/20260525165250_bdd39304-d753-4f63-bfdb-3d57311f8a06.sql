ALTER TABLE public.hourly_invoices
  ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'hourly';

ALTER TABLE public.hourly_invoices
  DROP CONSTRAINT IF EXISTS hourly_invoices_invoice_type_check;

ALTER TABLE public.hourly_invoices
  ADD CONSTRAINT hourly_invoices_invoice_type_check
  CHECK (invoice_type IN ('hourly', 'flat'));