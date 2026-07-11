
-- intake_forms
CREATE TABLE public.intake_forms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  recipient_name TEXT,
  recipient_email TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','viewed','completed')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  viewed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_intake_forms_token ON public.intake_forms(token);
CREATE INDEX idx_intake_forms_client ON public.intake_forms(client_id);

GRANT SELECT ON public.intake_forms TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intake_forms TO authenticated;
GRANT ALL ON public.intake_forms TO service_role;

ALTER TABLE public.intake_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view intake form by token"
  ON public.intake_forms FOR SELECT
  USING (true);

CREATE POLICY "Public can mark intake as viewed"
  ON public.intake_forms FOR UPDATE
  USING (status IN ('sent','viewed'))
  WITH CHECK (status IN ('sent','viewed','completed'));

CREATE POLICY "Admins and ops manage intake forms"
  ON public.intake_forms FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));

CREATE TRIGGER update_intake_forms_updated_at
  BEFORE UPDATE ON public.intake_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- intake_responses
CREATE TABLE public.intake_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  intake_form_id UUID NOT NULL REFERENCES public.intake_forms(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  business_name TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  social_accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  inspirations JSONB NOT NULL DEFAULT '[]'::jsonb,
  visual_style_notes TEXT,
  company_description TEXT,
  target_demographic TEXT,
  competitors TEXT,
  brand_voice TEXT,
  brand_guidelines TEXT,
  differentiators TEXT,
  active_platforms TEXT,
  expansion_platforms TEXT,
  primary_goals TEXT,
  dream_deliverables TEXT,
  turnaround_expectations TEXT,
  approval_process TEXT,
  success_kpis TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_intake_responses_form ON public.intake_responses(intake_form_id);
CREATE INDEX idx_intake_responses_client ON public.intake_responses(client_id);

GRANT SELECT, INSERT ON public.intake_responses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intake_responses TO authenticated;
GRANT ALL ON public.intake_responses TO service_role;

ALTER TABLE public.intake_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can submit intake response with valid token"
  ON public.intake_responses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.intake_forms f
      WHERE f.id = intake_form_id
        AND f.status <> 'completed'
        AND (f.expires_at IS NULL OR f.expires_at > now())
    )
  );

CREATE POLICY "Admins and ops view intake responses"
  ON public.intake_responses FOR SELECT
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));

CREATE POLICY "Admins and ops manage intake responses"
  ON public.intake_responses FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));

CREATE POLICY "Clients view their own intake responses"
  ON public.intake_responses FOR SELECT
  USING (client_id = public.get_client_id_for_user(auth.uid()));

CREATE TRIGGER update_intake_responses_updated_at
  BEFORE UPDATE ON public.intake_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notify admins on submission
CREATE OR REPLACE FUNCTION public.notify_on_intake_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_id uuid;
  _who text;
BEGIN
  -- Mark form completed
  UPDATE public.intake_forms
    SET status = 'completed', completed_at = now()
    WHERE id = NEW.intake_form_id;

  -- Touch client last contact
  IF NEW.client_id IS NOT NULL THEN
    UPDATE public.clients SET last_contact_date = CURRENT_DATE WHERE id = NEW.client_id;
  END IF;

  _who := COALESCE(NEW.business_name, NEW.contact_name, NEW.email, 'a prospect');
  FOR _admin_id IN SELECT user_id FROM public.user_roles WHERE role = 'admin'::app_role LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (
      _admin_id,
      'New intake response',
      _who || ' just submitted the Business Media intake form.',
      'message',
      '/admin/intakes'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_intake_submission
  AFTER INSERT ON public.intake_responses
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_intake_submission();
