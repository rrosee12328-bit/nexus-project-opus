-- Lightweight contacts created from one-time invoices. They remain available
-- for billing history and repeat invoices without entering the client portal,
-- onboarding, project workspace, or sales pipeline.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS billing_contact_only boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS clients_billing_contact_email_idx
  ON public.clients (lower(email))
  WHERE billing_contact_only = true AND email IS NOT NULL;

