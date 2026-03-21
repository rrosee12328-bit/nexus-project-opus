
-- 1. Auto-create tasks when a project phase starts
CREATE OR REPLACE FUNCTION public.auto_create_phase_tasks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _project_name text;
  _client_id uuid;
  _phase_label text;
BEGIN
  -- Only fire when phase status changes to in_progress
  IF NEW.status != 'in_progress' THEN RETURN NEW; END IF;
  IF OLD IS NOT NULL AND OLD.status = 'in_progress' THEN RETURN NEW; END IF;

  SELECT name, client_id INTO _project_name, _client_id
  FROM public.projects WHERE id = NEW.project_id;

  _phase_label := INITCAP(REPLACE(NEW.phase::text, '_', ' '));

  -- Create standard tasks for the phase
  INSERT INTO public.tasks (title, client_id, priority, status, description)
  VALUES
    (_phase_label || ' kickoff — ' || _project_name, _client_id, 'high', 'todo',
     'Start the ' || _phase_label || ' phase for project "' || _project_name || '".'),
    (_phase_label || ' review — ' || _project_name, _client_id, 'medium', 'todo',
     'Review deliverables for the ' || _phase_label || ' phase of "' || _project_name || '".');

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_phase_tasks
  AFTER UPDATE ON public.project_phases
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_phase_tasks();

-- 2. Auto-update project progress when phases are completed
CREATE OR REPLACE FUNCTION public.auto_update_project_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _total int;
  _completed int;
  _new_progress int;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed')
  INTO _total, _completed
  FROM public.project_phases
  WHERE project_id = NEW.project_id;

  IF _total > 0 THEN
    _new_progress := ROUND((_completed::numeric / _total::numeric) * 100);
    UPDATE public.projects
    SET progress = _new_progress,
        status = CASE
          WHEN _completed = _total THEN 'completed'::project_status
          WHEN _completed > 0 THEN 'in_progress'::project_status
          ELSE status
        END
    WHERE id = NEW.project_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_update_project_progress
  AFTER UPDATE ON public.project_phases
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.auto_update_project_progress();

-- 3. Auto-transition client from onboarding to active when all steps done
CREATE OR REPLACE FUNCTION public.auto_transition_client_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _total int;
  _done int;
  _client_status text;
BEGIN
  IF NEW.completed_at IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE completed_at IS NOT NULL)
  INTO _total, _done
  FROM public.client_onboarding_steps
  WHERE client_id = NEW.client_id;

  IF _total > 0 AND _done = _total THEN
    SELECT status INTO _client_status FROM public.clients WHERE id = NEW.client_id;
    IF _client_status = 'onboarding' THEN
      UPDATE public.clients SET status = 'active' WHERE id = NEW.client_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_transition_client_status
  AFTER UPDATE ON public.client_onboarding_steps
  FOR EACH ROW
  WHEN (OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL)
  EXECUTE FUNCTION public.auto_transition_client_status();
