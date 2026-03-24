
-- Add archived_at column to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;

-- Create trigger function to log completed tasks to project_activity_log
CREATE OR REPLACE FUNCTION public.log_task_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _project_ids uuid[];
  _pid uuid;
  _client_name text;
BEGIN
  -- Only fire when status changes to done
  IF NEW.status != 'done' THEN RETURN NEW; END IF;
  IF OLD IS NOT NULL AND OLD.status = 'done' THEN RETURN NEW; END IF;

  -- Get client name
  SELECT name INTO _client_name FROM public.clients WHERE id = NEW.client_id;

  -- Find all projects for this client to log against
  IF NEW.client_id IS NOT NULL THEN
    SELECT ARRAY_AGG(id) INTO _project_ids
    FROM public.projects
    WHERE client_id = NEW.client_id
      AND status IN ('in_progress', 'not_started');
    
    IF _project_ids IS NOT NULL THEN
      FOREACH _pid IN ARRAY _project_ids LOOP
        INSERT INTO public.project_activity_log (project_id, action, details)
        VALUES (_pid, 'task_completed', 'Completed: "' || NEW.title || '"');
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_log_task_completion ON public.tasks;
CREATE TRIGGER trg_log_task_completion
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_task_completion();
