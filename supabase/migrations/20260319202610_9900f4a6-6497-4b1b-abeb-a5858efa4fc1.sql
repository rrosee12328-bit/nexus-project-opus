-- Function to notify client when they receive a new message from admin/ops
CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _client_user_id uuid;
  _client_name text;
BEGIN
  -- Get the client's user_id
  SELECT user_id, name INTO _client_user_id, _client_name
  FROM public.clients WHERE id = NEW.client_id;

  -- Only notify if sender is NOT the client (i.e. admin/ops sent it)
  IF _client_user_id IS NOT NULL AND NEW.sender_id != _client_user_id THEN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (
      _client_user_id,
      'New message from Vektiss',
      LEFT(NEW.content, 100),
      'message',
      '/portal/messages'
    );
  END IF;

  -- Also notify admins when a client sends a message
  IF _client_user_id IS NOT NULL AND NEW.sender_id = _client_user_id THEN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    SELECT ur.user_id,
      'New message from ' || COALESCE(_client_name, 'a client'),
      LEFT(NEW.content, 100),
      'message',
      '/admin/messages'
    FROM public.user_roles ur WHERE ur.role = 'admin';
  END IF;

  RETURN NEW;
END;
$$;

-- Function to notify client when a payment is recorded
CREATE OR REPLACE FUNCTION public.notify_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _client_user_id uuid;
  _month_name text;
BEGIN
  SELECT user_id INTO _client_user_id FROM public.clients WHERE id = NEW.client_id;
  _month_name := (ARRAY['January','February','March','April','May','June','July','August','September','October','November','December'])[NEW.payment_month];

  IF _client_user_id IS NOT NULL AND NEW.notes IS DISTINCT FROM 'Projected' THEN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (
      _client_user_id,
      'Payment recorded',
      'A payment of $' || NEW.amount::text || ' for ' || _month_name || ' ' || NEW.payment_year::text || ' has been recorded.',
      'payment',
      '/portal/payments'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Function to notify client when their project is updated
CREATE OR REPLACE FUNCTION public.notify_on_project_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _client_user_id uuid;
BEGIN
  SELECT user_id INTO _client_user_id FROM public.clients WHERE id = NEW.client_id;

  IF _client_user_id IS NOT NULL THEN
    -- Notify on status change
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (
        _client_user_id,
        'Project update: ' || NEW.name,
        'Status changed to ' || REPLACE(NEW.status::text, '_', ' '),
        'project',
        '/portal/projects'
      );
    -- Notify on phase change
    ELSIF OLD.current_phase IS DISTINCT FROM NEW.current_phase THEN
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (
        _client_user_id,
        'Project update: ' || NEW.name,
        'Now in ' || REPLACE(NEW.current_phase::text, '_', ' ') || ' phase',
        'project',
        '/portal/projects'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Create triggers
CREATE TRIGGER trg_notify_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_message();

CREATE TRIGGER trg_notify_payment
  AFTER INSERT ON public.client_payments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_payment();

CREATE TRIGGER trg_notify_project_update
  AFTER UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_project_update();