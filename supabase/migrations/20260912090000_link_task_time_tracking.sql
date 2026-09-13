-- Keep task timers traceable to the client and project they belong to.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS time_code_id uuid REFERENCES public.time_tracking_codes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_project ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON public.time_entries(task_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_time_code ON public.time_entries(time_code_id);

CREATE OR REPLACE FUNCTION public.sync_task_work_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  linked_client_id uuid;
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT client_id INTO linked_client_id
  FROM public.projects
  WHERE id = NEW.project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected project does not exist';
  END IF;

  IF NEW.client_id IS NULL THEN
    NEW.client_id := linked_client_id;
  ELSIF NEW.client_id <> linked_client_id THEN
    RAISE EXCEPTION 'Selected project does not belong to the selected client';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_task_work_scope ON public.tasks;
CREATE TRIGGER sync_task_work_scope
  BEFORE INSERT OR UPDATE OF client_id, project_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.sync_task_work_scope();

CREATE OR REPLACE FUNCTION public.sync_time_entry_work_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  linked_client_id uuid;
  linked_project_id uuid;
BEGIN
  IF NEW.task_id IS NOT NULL THEN
    SELECT client_id, project_id
      INTO linked_client_id, linked_project_id
    FROM public.tasks
    WHERE id = NEW.task_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Selected task does not exist';
    END IF;

    IF NEW.client_id IS NULL THEN
      NEW.client_id := linked_client_id;
    ELSIF linked_client_id IS NOT NULL AND NEW.client_id <> linked_client_id THEN
      RAISE EXCEPTION 'Selected task does not belong to the selected client';
    END IF;

    IF NEW.project_id IS NULL THEN
      NEW.project_id := linked_project_id;
    ELSIF linked_project_id IS NOT NULL AND NEW.project_id <> linked_project_id THEN
      RAISE EXCEPTION 'Selected task does not belong to the selected project';
    END IF;
  END IF;

  IF NEW.project_id IS NOT NULL THEN
    SELECT client_id INTO linked_client_id
    FROM public.projects
    WHERE id = NEW.project_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Selected project does not exist';
    END IF;

    IF NEW.client_id IS NULL THEN
      NEW.client_id := linked_client_id;
    ELSIF NEW.client_id <> linked_client_id THEN
      RAISE EXCEPTION 'Selected project does not belong to the selected client';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_time_entry_work_scope ON public.time_entries;
CREATE TRIGGER sync_time_entry_work_scope
  BEFORE INSERT OR UPDATE OF client_id, project_id, task_id ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.sync_time_entry_work_scope();
