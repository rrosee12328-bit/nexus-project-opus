
-- Activity log table
CREATE TABLE public.project_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  action text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_activity_project ON public.project_activity_log(project_id, created_at DESC);

ALTER TABLE public.project_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage activity log"
  ON public.project_activity_log FOR ALL
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Ops can view activity log"
  ON public.project_activity_log FOR SELECT
  TO public
  USING (has_role(auth.uid(), 'ops'::app_role));

CREATE POLICY "Clients can view own project activity"
  ON public.project_activity_log FOR SELECT
  TO public
  USING (project_id IN (
    SELECT id FROM public.projects WHERE client_id = get_client_id_for_user(auth.uid())
  ));

-- Trigger: log project-level changes
CREATE OR REPLACE FUNCTION public.log_project_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.project_activity_log (project_id, action, details)
    VALUES (NEW.id, 'status_change', 'Status changed from ' || REPLACE(OLD.status::text,'_',' ') || ' to ' || REPLACE(NEW.status::text,'_',' '));
  END IF;

  IF OLD.current_phase IS DISTINCT FROM NEW.current_phase THEN
    INSERT INTO public.project_activity_log (project_id, action, details)
    VALUES (NEW.id, 'phase_change', 'Phase moved from ' || REPLACE(OLD.current_phase::text,'_',' ') || ' to ' || REPLACE(NEW.current_phase::text,'_',' '));
  END IF;

  IF OLD.progress IS DISTINCT FROM NEW.progress THEN
    INSERT INTO public.project_activity_log (project_id, action, details)
    VALUES (NEW.id, 'progress_update', 'Progress updated from ' || OLD.progress || '% to ' || NEW.progress || '%');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_project_changes
  AFTER UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.log_project_changes();

-- Trigger: log phase-level changes
CREATE OR REPLACE FUNCTION public.log_phase_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _phase_label text;
BEGIN
  _phase_label := INITCAP(REPLACE(NEW.phase::text, '_', ' '));

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.project_activity_log (project_id, action, details)
    VALUES (NEW.project_id, 'phase_status_change', _phase_label || ' phase changed to ' || REPLACE(NEW.status::text,'_',' '));
  END IF;

  IF OLD.notes IS DISTINCT FROM NEW.notes AND NEW.notes IS NOT NULL THEN
    INSERT INTO public.project_activity_log (project_id, action, details)
    VALUES (NEW.project_id, 'phase_note', 'Note updated on ' || _phase_label || ' phase');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_phase_changes
  AFTER UPDATE ON public.project_phases
  FOR EACH ROW
  EXECUTE FUNCTION public.log_phase_changes();
