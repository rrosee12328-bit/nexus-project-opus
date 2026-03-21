
-- Add a recurring_source column to tasks for the recurring system
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurring_key text DEFAULT NULL;

-- Update the two Goodland tasks: set due to next Tuesday, daily_focus, and recurring_key
UPDATE public.tasks
SET due_date = (CURRENT_DATE + ((2 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7))::date,
    daily_focus = true,
    recurring_key = 'goodland_thursday_invite'
WHERE title = 'Goodland Church — Thursday Invite Video' AND status = 'todo';

UPDATE public.tasks
SET due_date = (CURRENT_DATE + ((2 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7))::date,
    daily_focus = true,
    recurring_key = 'goodland_saturday_creative'
WHERE title = 'Goodland Church — Saturday Creative Video' AND status = 'todo';

-- Trigger: when a recurring task is marked done, auto-create next week's copy
CREATE OR REPLACE FUNCTION public.auto_recreate_recurring_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _next_tuesday date;
BEGIN
  -- Only fire when status changes to done and task has a recurring_key
  IF NEW.status != 'done' THEN RETURN NEW; END IF;
  IF NEW.recurring_key IS NULL THEN RETURN NEW; END IF;
  IF OLD.status = 'done' THEN RETURN NEW; END IF;

  -- Calculate next Tuesday from today
  _next_tuesday := (CURRENT_DATE + ((2 - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7 + 7))::date;
  -- If today is Tuesday, still go to next week
  IF _next_tuesday <= CURRENT_DATE THEN
    _next_tuesday := _next_tuesday + 7;
  END IF;

  -- Create the next week's task
  INSERT INTO public.tasks (title, client_id, priority, status, description, due_date, daily_focus, recurring_key, assigned_to)
  VALUES (
    NEW.title,
    NEW.client_id,
    NEW.priority,
    'todo',
    NEW.description,
    _next_tuesday,
    true,
    NEW.recurring_key,
    NEW.assigned_to
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_recreate_recurring_task
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.auto_recreate_recurring_task();
