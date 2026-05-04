
-- 1. billing_model on clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS billing_model text NOT NULL DEFAULT 'monthly'
  CHECK (billing_model IN ('monthly','phase_based','hybrid'));

-- backfill from existing fees
UPDATE public.clients
SET billing_model = CASE
  WHEN COALESCE(monthly_fee,0) > 0 AND COALESCE(setup_fee,0) > 0 THEN 'hybrid'
  WHEN COALESCE(monthly_fee,0) = 0 AND COALESCE(setup_fee,0) > 0 THEN 'phase_based'
  ELSE 'monthly'
END;

-- keep it in sync automatically
CREATE OR REPLACE FUNCTION public.sync_client_billing_model()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.billing_model := CASE
    WHEN COALESCE(NEW.monthly_fee,0) > 0 AND COALESCE(NEW.setup_fee,0) > 0 THEN 'hybrid'
    WHEN COALESCE(NEW.monthly_fee,0) = 0 AND COALESCE(NEW.setup_fee,0) > 0 THEN 'phase_based'
    ELSE 'monthly'
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_client_billing_model ON public.clients;
CREATE TRIGGER trg_sync_client_billing_model
BEFORE INSERT OR UPDATE OF monthly_fee, setup_fee ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.sync_client_billing_model();

-- 2. phase_milestone_invoices
CREATE TABLE IF NOT EXISTS public.phase_milestone_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  project_id uuid,
  phase text NOT NULL CHECK (phase IN ('discovery','development','deploy')),
  pct numeric NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','invoiced','paid','skipped')),
  stripe_invoice_id text,
  invoiced_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, project_id, phase)
);

ALTER TABLE public.phase_milestone_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage milestone invoices" ON public.phase_milestone_invoices
FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role))
WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Ops view milestone invoices" ON public.phase_milestone_invoices
FOR SELECT TO authenticated USING (has_role(auth.uid(),'ops'::app_role));

CREATE POLICY "Clients view own milestone invoices" ON public.phase_milestone_invoices
FOR SELECT TO authenticated USING (client_id = get_client_id_for_user(auth.uid()));

CREATE POLICY "Service role full access milestone invoices" ON public.phase_milestone_invoices
FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_phase_milestone_invoices_updated_at ON public.phase_milestone_invoices;
CREATE TRIGGER trg_phase_milestone_invoices_updated_at
BEFORE UPDATE ON public.phase_milestone_invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Phase advance automation
CREATE OR REPLACE FUNCTION public.handle_project_phase_advance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client RECORD;
  v_pct numeric;
  v_amount numeric;
  v_admin RECORD;
BEGIN
  IF NEW.current_phase IS NOT DISTINCT FROM OLD.current_phase THEN
    RETURN NEW;
  END IF;

  SELECT id, name, billing_model, setup_fee, billing_paused_until
    INTO v_client
  FROM public.clients WHERE id = NEW.client_id;

  IF v_client.id IS NULL THEN RETURN NEW; END IF;

  -- Clear an indefinite pause when moving forward
  IF v_client.billing_paused_until IS NOT NULL
     AND v_client.billing_paused_until > (now() + interval '1 year')::date THEN
    UPDATE public.clients SET billing_paused_until = NULL WHERE id = v_client.id;
  END IF;

  -- Only auto-create milestones for phase-based / hybrid clients with a setup fee
  IF v_client.billing_model IN ('phase_based','hybrid')
     AND COALESCE(v_client.setup_fee,0) > 0
     AND NEW.current_phase IN ('discovery','development','deploy') THEN

    v_pct := CASE NEW.current_phase
      WHEN 'discovery' THEN 50
      WHEN 'development' THEN 25
      WHEN 'deploy' THEN 25
    END;
    v_amount := ROUND(v_client.setup_fee * (v_pct / 100.0), 2);

    INSERT INTO public.phase_milestone_invoices
      (client_id, project_id, phase, pct, amount, status)
    VALUES
      (v_client.id, NEW.id, NEW.current_phase, v_pct, v_amount, 'pending')
    ON CONFLICT (client_id, project_id, phase) DO NOTHING;

    -- Notify all admins
    FOR v_admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin'::app_role LOOP
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (
        v_admin.user_id,
        'Phase advanced — milestone invoice ready',
        v_client.name || ' moved to ' || NEW.current_phase || ' phase. Next invoice: $' || v_amount::text,
        'payment',
        '/admin/clients/' || v_client.id
      );
    END LOOP;

    -- Activity log
    INSERT INTO public.admin_activity_log (user_id, action, entity_type, entity_id, summary, metadata)
    VALUES (
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      'phase_advance',
      'project',
      NEW.id::text,
      v_client.name || ' → ' || NEW.current_phase || ' ($' || v_amount::text || ' due)',
      jsonb_build_object(
        'client_id', v_client.id,
        'phase', NEW.current_phase,
        'amount', v_amount
      )
    );
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_project_phase_advance ON public.projects;
CREATE TRIGGER trg_project_phase_advance
AFTER UPDATE OF current_phase ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.handle_project_phase_advance();

-- 4. Calendar event ↔ client touchpoint
CREATE OR REPLACE FUNCTION public.touch_client_on_calendar_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.client_id IS NOT NULL THEN
    UPDATE public.clients
    SET last_contact_date = GREATEST(COALESCE(last_contact_date, NEW.event_date), NEW.event_date)
    WHERE id = NEW.client_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_client_on_calendar_event ON public.calendar_events;
CREATE TRIGGER trg_touch_client_on_calendar_event
AFTER INSERT OR UPDATE OF event_date, client_id ON public.calendar_events
FOR EACH ROW EXECUTE FUNCTION public.touch_client_on_calendar_event();

-- 5. Backfill milestone for currently-paid Discovery payments
INSERT INTO public.phase_milestone_invoices (client_id, project_id, phase, pct, amount, status, paid_at)
SELECT c.id, p.id, 'discovery', 50, ROUND(c.setup_fee * 0.5, 2), 'paid', now()
FROM public.clients c
LEFT JOIN public.projects p ON p.client_id = c.id
WHERE c.billing_model = 'phase_based'
  AND COALESCE(c.setup_fee,0) > 0
  AND COALESCE(c.setup_paid,0) >= ROUND(c.setup_fee * 0.5, 2)
ON CONFLICT (client_id, project_id, phase) DO NOTHING;
