
-- Client direct costs table for tracking production costs per client
CREATE TABLE public.client_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  category text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  details text,
  is_monthly boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Business overhead table for shared tools, operating expenses, salaries
CREATE TABLE public.business_overhead (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.client_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_overhead ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage client costs" ON public.client_costs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Ops can view client costs" ON public.client_costs FOR SELECT
  USING (has_role(auth.uid(), 'ops'::app_role));

CREATE POLICY "Admins can manage overhead" ON public.business_overhead FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Ops can view overhead" ON public.business_overhead FOR SELECT
  USING (has_role(auth.uid(), 'ops'::app_role));

CREATE TRIGGER update_client_costs_updated_at
  BEFORE UPDATE ON public.client_costs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
