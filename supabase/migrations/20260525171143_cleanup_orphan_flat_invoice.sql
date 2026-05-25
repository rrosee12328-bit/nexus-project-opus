-- Remove a flat invoice draft row that was created when the Stripe call failed.
-- Identified by missing stripe_invoice_id.
delete from public.hourly_invoices
where invoice_type = 'flat' and stripe_invoice_id is null;
