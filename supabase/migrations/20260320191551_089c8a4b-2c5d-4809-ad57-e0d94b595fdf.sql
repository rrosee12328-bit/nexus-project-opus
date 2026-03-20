-- Onboarding project templates configurable by admins
CREATE TABLE public.onboarding_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_type text NOT NULL UNIQUE,
  project_name text NOT NULL,
  project_description text NOT NULL DEFAULT '',
  phases text[] NOT NULL DEFAULT ARRAY['discovery','design','development','review','launch'],
  onboarding_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage onboarding templates"
  ON public.onboarding_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can read onboarding templates"
  ON public.onboarding_templates FOR SELECT
  USING (auth.role() = 'service_role');

-- Trigger to auto-update updated_at
CREATE TRIGGER trg_onboarding_templates_updated_at
  BEFORE UPDATE ON public.onboarding_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();