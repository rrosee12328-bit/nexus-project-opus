-- Trigger function to send email when a task is assigned
CREATE OR REPLACE FUNCTION public.email_on_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _assignee_email text;
  _assignee_name text;
  _subject text;
  _html text;
  _msg_id text;
  _due_info text;
BEGIN
  -- Only fire when assigned_to changes to a non-null value
  IF NEW.assigned_to IS NULL THEN RETURN NEW; END IF;
  IF OLD IS NOT NULL AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to THEN RETURN NEW; END IF;

  -- Get assignee info
  SELECT u.email INTO _assignee_email
  FROM auth.users u WHERE u.id = NEW.assigned_to;
  IF _assignee_email IS NULL THEN RETURN NEW; END IF;

  SELECT display_name INTO _assignee_name
  FROM public.profiles WHERE user_id = NEW.assigned_to;

  _due_info := '';
  IF NEW.due_date IS NOT NULL THEN
    _due_info := ' It''s due on <strong style="color: #0d0d0d;">' || NEW.due_date::text || '</strong>.';
  END IF;

  _subject := 'New task assigned: ' || NEW.title;
  _msg_id := gen_random_uuid()::text;

  _html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Inter, Arial, sans-serif; background-color: #ffffff; padding: 40px 25px;">'
    || '<h1 style="font-size: 24px; font-weight: bold; color: #0d0d0d; margin: 0 0 20px;">New Task Assigned</h1>'
    || '<p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 25px;">Hi ' || COALESCE(_assignee_name, 'there')
    || ', you''ve been assigned a new task: "<strong style="color: #0d0d0d;">' || replace(replace(NEW.title, '&', '&amp;'), '<', '&lt;')
    || '</strong>" (' || NEW.priority::text || ' priority).' || _due_info || '</p>'
    || '<a href="https://nexus-project-opus.lovable.app/ops/tasks" style="display: inline-block; background-color: hsl(213, 100%, 58%); color: #ffffff; font-size: 14px; font-weight: 600; border-radius: 6px; padding: 12px 24px; text-decoration: none;">View Tasks</a>'
    || '<p style="font-size: 12px; color: #999999; margin: 30px 0 0;">This is an automated notification from Vektiss.</p></body></html>';

  PERFORM public.enqueue_email('transactional_emails', jsonb_build_object(
    'to', _assignee_email,
    'from', 'Vektiss <noreply@mail.vektiss.com>',
    'sender_domain', 'mail.vektiss.com',
    'subject', _subject,
    'html', _html,
    'text', 'Hi ' || COALESCE(_assignee_name, 'there') || ', you''ve been assigned "' || NEW.title || '".',
    'purpose', 'transactional',
    'label', 'task_assigned',
    'message_id', _msg_id,
    'queued_at', now()::text
  ));

  RETURN NEW;
END;
$function$;

-- Also create a notification for the assignee
CREATE OR REPLACE FUNCTION public.notify_on_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.assigned_to IS NULL THEN RETURN NEW; END IF;
  IF OLD IS NOT NULL AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (user_id, title, body, type, link)
  VALUES (
    NEW.assigned_to,
    'Task assigned to you',
    'You''ve been assigned: "' || NEW.title || '"',
    'task',
    '/ops/tasks'
  );

  RETURN NEW;
END;
$function$;

-- Attach triggers
CREATE TRIGGER trg_email_on_task_assigned
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.email_on_task_assigned();

CREATE TRIGGER trg_notify_on_task_assigned
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_task_assigned();