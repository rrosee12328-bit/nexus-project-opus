
-- Approval requests table
CREATE TABLE public.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  phase text,
  status text NOT NULL DEFAULT 'pending',
  submitted_by uuid NOT NULL,
  responded_at timestamptz,
  response_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

-- Admins can manage all
CREATE POLICY "Admins can manage approvals" ON public.approval_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Ops can view
CREATE POLICY "Ops can view approvals" ON public.approval_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'ops'));

-- Clients can view and update their own
CREATE POLICY "Clients can view own approvals" ON public.approval_requests
  FOR SELECT TO authenticated
  USING (client_id = public.get_client_id_for_user(auth.uid()));

CREATE POLICY "Clients can respond to own approvals" ON public.approval_requests
  FOR UPDATE TO authenticated
  USING (client_id = public.get_client_id_for_user(auth.uid()))
  WITH CHECK (client_id = public.get_client_id_for_user(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notification trigger when approval is submitted
CREATE OR REPLACE FUNCTION public.notify_on_approval_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _client_user_id uuid;
BEGIN
  SELECT user_id INTO _client_user_id FROM public.clients WHERE id = NEW.client_id;
  IF _client_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (
      _client_user_id,
      'Approval needed: ' || NEW.title,
      COALESCE(NEW.description, 'A deliverable is ready for your review.'),
      'project',
      '/portal/projects'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_approval_request
  AFTER INSERT ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_approval_request();

-- Notification trigger when client responds
CREATE OR REPLACE FUNCTION public.notify_on_approval_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _admin_id uuid;
BEGIN
  IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
    FOR _admin_id IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (
        _admin_id,
        NEW.title || ' — ' || NEW.status,
        CASE WHEN NEW.response_note IS NOT NULL THEN NEW.response_note ELSE 'Client ' || NEW.status || ' this deliverable.' END,
        'project',
        '/admin/projects'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_approval_response
  AFTER UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_approval_response();
