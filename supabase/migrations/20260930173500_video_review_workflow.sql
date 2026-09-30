-- Let operations staff send completed Dropbox videos for client review.
DROP POLICY IF EXISTS "Ops can view approvals" ON public.approval_requests;
DROP POLICY IF EXISTS "Ops can manage approvals" ON public.approval_requests;
CREATE POLICY "Ops can manage approvals" ON public.approval_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ops'))
  WITH CHECK (public.has_role(auth.uid(), 'ops'));

-- New review requests must use a real Dropbox sharing host. Existing historic
-- non-video approval links are retained because this trigger only validates a
-- new link or a changed link.
CREATE OR REPLACE FUNCTION public.validate_approval_review_url()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.review_url IS NOT NULL
    AND NEW.review_url !~ '^https://([[:alnum:]-]+\.)*(dropbox\.com|dropboxusercontent\.com)/' THEN
    RAISE EXCEPTION 'Video review links must be secure Dropbox shared links';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_approval_review_url ON public.approval_requests;
CREATE TRIGGER validate_approval_review_url
  BEFORE INSERT OR UPDATE OF review_url ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_approval_review_url();

-- A client can make one final response to a pending review. The deliverable,
-- project, and client remain immutable for non-staff users.
CREATE OR REPLACE FUNCTION public.enforce_approval_response_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'approved', 'rejected', 'suggestions') THEN
    RAISE EXCEPTION 'Unsupported approval status';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'ops') THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'This video review has already received a response';
    END IF;

    IF NEW.status NOT IN ('approved', 'rejected', 'suggestions') THEN
      RAISE EXCEPTION 'Choose approve, decline, or suggestions';
    END IF;

    IF NEW.status IN ('rejected', 'suggestions')
      AND NULLIF(trim(COALESCE(NEW.response_note, '')), '') IS NULL THEN
      RAISE EXCEPTION 'A response note is required for declines and suggestions';
    END IF;

    NEW.title := OLD.title;
    NEW.description := OLD.description;
    NEW.review_url := OLD.review_url;
    NEW.phase := OLD.phase;
    NEW.project_id := OLD.project_id;
    NEW.client_id := OLD.client_id;
    NEW.submitted_by := OLD.submitted_by;
    NEW.created_at := OLD.created_at;
    NEW.id := OLD.id;
    NEW.responded_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- Take the client directly to the dedicated review workflow when a new video arrives.
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
      'Video review needed: ' || NEW.title,
      COALESCE(NEW.description, 'A completed video is ready for your review.'),
      'project',
      '/portal/approvals'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Notify every internal role that can act on the outcome, including suggestions.
CREATE OR REPLACE FUNCTION public.notify_on_approval_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _recipient record;
DECLARE _status_label text;
BEGIN
  IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected', 'suggestions') THEN
    _status_label := CASE NEW.status
      WHEN 'approved' THEN 'approved'
      WHEN 'rejected' THEN 'declined / changes requested'
      WHEN 'suggestions' THEN 'suggestions sent'
    END;

    FOR _recipient IN
      SELECT user_id, role FROM public.user_roles WHERE role IN ('admin', 'ops')
    LOOP
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (
        _recipient.user_id,
        NEW.title || ' — ' || _status_label,
        COALESCE(NEW.response_note, 'The client ' || _status_label || ' this video.'),
        'project',
        CASE
          WHEN _recipient.role = 'admin' THEN '/admin/clients/' || NEW.client_id || '?tab=projects'
          ELSE '/ops/reviews'
        END
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
