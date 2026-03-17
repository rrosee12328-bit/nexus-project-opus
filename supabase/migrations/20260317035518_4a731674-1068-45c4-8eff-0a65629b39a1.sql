
-- Client status enum
CREATE TYPE public.client_status AS ENUM ('active', 'onboarding', 'closed', 'prospect');

-- Clients table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  status client_status NOT NULL DEFAULT 'prospect',
  start_date DATE,
  setup_fee NUMERIC(10,2) DEFAULT 0,
  setup_paid NUMERIC(10,2) DEFAULT 0,
  balance_due NUMERIC(10,2) DEFAULT 0,
  monthly_fee NUMERIC(10,2) DEFAULT 0,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Admins can do everything with clients
CREATE POLICY "Admins can manage clients"
  ON public.clients FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Ops can view clients
CREATE POLICY "Ops can view clients"
  ON public.clients FOR SELECT
  USING (public.has_role(auth.uid(), 'ops'));

-- Client payments table (monthly payment records)
CREATE TABLE public.client_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_month INTEGER NOT NULL CHECK (payment_month BETWEEN 1 AND 12),
  payment_year INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage payments"
  ON public.client_payments FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Ops can view payments"
  ON public.client_payments FOR SELECT
  USING (public.has_role(auth.uid(), 'ops'));

-- Updated_at trigger for clients
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
