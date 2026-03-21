-- 1. Lock down client_onboarding_steps: clients can only set completed_at
CREATE OR REPLACE FUNCTION public.enforce_onboarding_step_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') AND NOT has_role(auth.uid(), 'ops') THEN
    NEW.step_key := OLD.step_key;
    NEW.title := OLD.title;
    NEW.description := OLD.description;
    NEW.sort_order := OLD.sort_order;
    NEW.category := OLD.category;
    NEW.client_id := OLD.client_id;
    NEW.id := OLD.id;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_onboarding_step_update ON public.client_onboarding_steps;
CREATE TRIGGER trg_enforce_onboarding_step_update
  BEFORE UPDATE ON public.client_onboarding_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_onboarding_step_update();

-- 2. Lock down approval_requests: clients can only set status, response_note, responded_at
CREATE OR REPLACE FUNCTION public.enforce_approval_response_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') AND NOT has_role(auth.uid(), 'ops') THEN
    NEW.title := OLD.title;
    NEW.description := OLD.description;
    NEW.phase := OLD.phase;
    NEW.project_id := OLD.project_id;
    NEW.client_id := OLD.client_id;
    NEW.submitted_by := OLD.submitted_by;
    NEW.created_at := OLD.created_at;
    NEW.id := OLD.id;
    -- Only allow: status, response_note, responded_at, updated_at
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_approval_response_update ON public.approval_requests;
CREATE TRIGGER trg_enforce_approval_response_update
  BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_approval_response_update();