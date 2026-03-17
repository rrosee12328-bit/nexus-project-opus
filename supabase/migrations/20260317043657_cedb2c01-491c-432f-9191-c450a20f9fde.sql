
-- Monthly expenses table with per-month tracking
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  expense_month integer NOT NULL,
  expense_year integer NOT NULL DEFAULT 2026,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage expenses" ON public.expenses FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Ops can view expenses" ON public.expenses FOR SELECT
  USING (has_role(auth.uid(), 'ops'::app_role));

-- Owner investments table
CREATE TABLE public.investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  investment_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage investments" ON public.investments FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Ops can view investments" ON public.investments FOR SELECT
  USING (has_role(auth.uid(), 'ops'::app_role));
