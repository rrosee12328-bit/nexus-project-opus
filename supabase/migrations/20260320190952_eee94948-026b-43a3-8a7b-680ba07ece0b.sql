-- Onboarding steps tracking per client
CREATE TABLE public.client_onboarding_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, step_key)
);

ALTER TABLE public.client_onboarding_steps ENABLE ROW LEVEL SECURITY;

-- Clients can view their own onboarding steps
CREATE POLICY "Clients can view own onboarding steps"
  ON public.client_onboarding_steps
  FOR SELECT TO authenticated
  USING (client_id = public.get_client_id_for_user(auth.uid()));

-- Clients can update (complete) their own steps
CREATE POLICY "Clients can update own onboarding steps"
  ON public.client_onboarding_steps
  FOR UPDATE TO authenticated
  USING (client_id = public.get_client_id_for_user(auth.uid()));

-- Admins full access
CREATE POLICY "Admins can manage onboarding steps"
  ON public.client_onboarding_steps
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Service role full access (for edge function)
CREATE POLICY "Service role can manage onboarding steps"
  ON public.client_onboarding_steps
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Ops can view
CREATE POLICY "Ops can view onboarding steps"
  ON public.client_onboarding_steps
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'ops'));