-- Add Stripe columns to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Add Stripe columns to client_payments
ALTER TABLE public.client_payments ADD COLUMN IF NOT EXISTS stripe_invoice_id text;
ALTER TABLE public.client_payments ADD COLUMN IF NOT EXISTS payment_source text NOT NULL DEFAULT 'manual';

-- Create stripe_subscriptions table
CREATE TABLE public.stripe_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  stripe_subscription_id text UNIQUE NOT NULL,
  stripe_price_id text,
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create stripe_invoices table
CREATE TABLE public.stripe_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  stripe_invoice_id text UNIQUE NOT NULL,
  stripe_invoice_number text,
  amount_due integer NOT NULL DEFAULT 0,
  amount_paid integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'draft',
  due_date timestamptz,
  paid_at timestamptz,
  hosted_invoice_url text,
  invoice_pdf text,
  description text,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.stripe_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_invoices ENABLE ROW LEVEL SECURITY;

-- RLS for stripe_subscriptions
CREATE POLICY "Admins can manage subscriptions" ON public.stripe_subscriptions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view own subscriptions" ON public.stripe_subscriptions
  FOR SELECT TO authenticated
  USING (client_id = get_client_id_for_user(auth.uid()));

CREATE POLICY "Ops can view subscriptions" ON public.stripe_subscriptions
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'ops'::app_role));

CREATE POLICY "Service role full access subscriptions" ON public.stripe_subscriptions
  FOR ALL TO public
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

-- RLS for stripe_invoices
CREATE POLICY "Admins can manage invoices" ON public.stripe_invoices
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view own invoices" ON public.stripe_invoices
  FOR SELECT TO authenticated
  USING (client_id = get_client_id_for_user(auth.uid()));

CREATE POLICY "Ops can view invoices" ON public.stripe_invoices
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'ops'::app_role));

CREATE POLICY "Service role full access invoices" ON public.stripe_invoices
  FOR ALL TO public
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

-- Updated_at triggers
CREATE TRIGGER update_stripe_subscriptions_updated_at
  BEFORE UPDATE ON public.stripe_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stripe_invoices_updated_at
  BEFORE UPDATE ON public.stripe_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();