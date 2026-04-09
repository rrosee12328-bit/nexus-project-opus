
CREATE TABLE public.client_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  contract_type TEXT NOT NULL DEFAULT 'uploaded',
  signed_at TIMESTAMP WITH TIME ZONE,
  signed_by TEXT,
  monthly_fee NUMERIC DEFAULT 0,
  setup_fee NUMERIC DEFAULT 0,
  notes TEXT,
  uploaded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage contracts"
  ON public.client_contracts FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Ops can view contracts"
  ON public.client_contracts FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'ops'));

CREATE POLICY "Clients can view own contracts"
  ON public.client_contracts FOR SELECT
  TO authenticated
  USING (client_id = get_client_id_for_user(auth.uid()));

CREATE TRIGGER update_client_contracts_updated_at
  BEFORE UPDATE ON public.client_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
