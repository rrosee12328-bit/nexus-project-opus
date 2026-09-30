-- A delivery can point to a Dropbox folder, while each named video keeps its own review outcome.
CREATE TABLE IF NOT EXISTS public.approval_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id uuid NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  review_url text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suggestions')),
  response_note text,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_request_items_request_position
  ON public.approval_request_items(approval_request_id, position);

ALTER TABLE public.approval_request_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage approval review items" ON public.approval_request_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'));

CREATE POLICY "Clients view own approval review items" ON public.approval_request_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_requests request
      WHERE request.id = approval_request_id
        AND request.client_id = public.get_client_id_for_user(auth.uid())
    )
  );

CREATE POLICY "Clients respond to own approval review items" ON public.approval_request_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_requests request
      WHERE request.id = approval_request_id
        AND request.client_id = public.get_client_id_for_user(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.approval_requests request
      WHERE request.id = approval_request_id
        AND request.client_id = public.get_client_id_for_user(auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_request_items TO authenticated;
GRANT ALL ON public.approval_request_items TO service_role;

CREATE OR REPLACE FUNCTION public.validate_approval_review_item_url()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.review_url !~ '^https://([[:alnum:]-]+\.)*(dropbox\.com|dropboxusercontent\.com)/' THEN
    RAISE EXCEPTION 'Video review links must be secure Dropbox shared links';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_approval_request_item_response_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'approved', 'rejected', 'suggestions') THEN
    RAISE EXCEPTION 'Unsupported approval item status';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'ops') THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'This video has already received a response';
    END IF;

    IF NEW.status NOT IN ('approved', 'rejected', 'suggestions') THEN
      RAISE EXCEPTION 'Choose approve, decline, or suggestions';
    END IF;

    IF NEW.status IN ('rejected', 'suggestions')
      AND NULLIF(trim(COALESCE(NEW.response_note, '')), '') IS NULL THEN
      RAISE EXCEPTION 'A response note is required for declines and suggestions';
    END IF;

    NEW.id := OLD.id;
    NEW.approval_request_id := OLD.approval_request_id;
    NEW.title := OLD.title;
    NEW.review_url := OLD.review_url;
    NEW.position := OLD.position;
    NEW.created_at := OLD.created_at;
    NEW.responded_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_approval_review_item_url
  BEFORE INSERT OR UPDATE OF review_url ON public.approval_request_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_approval_review_item_url();

CREATE TRIGGER enforce_approval_request_item_response_update
  BEFORE UPDATE ON public.approval_request_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_approval_request_item_response_update();

CREATE TRIGGER set_approval_request_items_updated_at
  BEFORE UPDATE ON public.approval_request_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Clients must respond at the item level for any grouped delivery. The parent
-- request is updated only from the controlled item-status trigger below.
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
    IF EXISTS (SELECT 1 FROM public.approval_request_items WHERE approval_request_id = OLD.id) THEN
      IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Respond to each video in this grouped review';
    END IF;

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

CREATE OR REPLACE FUNCTION public.sync_approval_request_from_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _total integer;
  _pending integer;
  _approved integer;
  _rejected integer;
  _suggestions integer;
  _status text;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'pending'),
    count(*) FILTER (WHERE status = 'approved'),
    count(*) FILTER (WHERE status = 'rejected'),
    count(*) FILTER (WHERE status = 'suggestions')
  INTO _total, _pending, _approved, _rejected, _suggestions
  FROM public.approval_request_items
  WHERE approval_request_id = NEW.approval_request_id;

  IF _total = 0 OR _pending > 0 THEN
    RETURN NEW;
  END IF;

  _status := CASE
    WHEN _rejected > 0 THEN 'rejected'
    WHEN _suggestions > 0 THEN 'suggestions'
    ELSE 'approved'
  END;

  UPDATE public.approval_requests
  SET
    status = _status,
    responded_at = now(),
    response_note = format(
      'All %s videos reviewed: %s approved, %s changes requested, %s with suggestions.',
      _total, _approved, _rejected, _suggestions
    )
  WHERE id = NEW.approval_request_id
    AND status = 'pending';

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_approval_item_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _recipient record;
  _review_title text;
  _client_id uuid;
  _status_label text;
BEGIN
  IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected', 'suggestions') THEN
    SELECT title, client_id INTO _review_title, _client_id
    FROM public.approval_requests WHERE id = NEW.approval_request_id;

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
        _review_title || ' · ' || NEW.title || ' — ' || _status_label,
        COALESCE(NEW.response_note, 'The client ' || _status_label || ' this video.'),
        'project',
        CASE
          WHEN _recipient.role = 'admin' THEN '/admin/clients/' || _client_id || '?tab=projects'
          ELSE '/ops/reviews'
        END
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_approval_request_from_items
  AFTER UPDATE OF status ON public.approval_request_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_approval_request_from_items();

CREATE TRIGGER notify_on_approval_item_response
  AFTER UPDATE OF status ON public.approval_request_items
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_approval_item_response();

CREATE OR REPLACE FUNCTION public.create_video_review_request(
  _project_id uuid,
  _title text,
  _description text,
  _review_url text,
  _phase text,
  _items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _client_id uuid;
  _request_id uuid;
  _item jsonb;
  _position integer := 0;
  _item_title text;
  _item_url text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'ops') THEN
    RAISE EXCEPTION 'Only staff can send video reviews';
  END IF;

  IF NULLIF(trim(COALESCE(_title, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A review title is required';
  END IF;

  IF _review_url !~ '^https://([[:alnum:]-]+\.)*(dropbox\.com|dropboxusercontent\.com)/' THEN
    RAISE EXCEPTION 'Video review links must be secure Dropbox shared links';
  END IF;

  IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Add at least one video to the review';
  END IF;

  SELECT client_id INTO _client_id FROM public.projects WHERE id = _project_id;
  IF _client_id IS NULL THEN
    RAISE EXCEPTION 'Choose a project linked to a client';
  END IF;

  INSERT INTO public.approval_requests (
    project_id, client_id, title, description, review_url, phase, submitted_by
  ) VALUES (
    _project_id, _client_id, trim(_title), NULLIF(trim(COALESCE(_description, '')), ''),
    _review_url, NULLIF(trim(COALESCE(_phase, '')), ''), auth.uid()
  ) RETURNING id INTO _request_id;

  FOR _item IN SELECT value FROM jsonb_array_elements(_items)
  LOOP
    _position := _position + 1;
    _item_title := NULLIF(trim(COALESCE(_item->>'title', '')), '');
    _item_url := COALESCE(NULLIF(trim(COALESCE(_item->>'review_url', '')), ''), _review_url);

    IF _item_title IS NULL THEN
      RAISE EXCEPTION 'Every video needs a title';
    END IF;
    IF _item_url !~ '^https://([[:alnum:]-]+\.)*(dropbox\.com|dropboxusercontent\.com)/' THEN
      RAISE EXCEPTION 'Video review links must be secure Dropbox shared links';
    END IF;

    INSERT INTO public.approval_request_items (approval_request_id, title, review_url, position)
    VALUES (_request_id, _item_title, _item_url, _position);
  END LOOP;

  RETURN _request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_video_review_request(uuid, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_video_review_request(uuid, text, text, text, text, jsonb) TO authenticated;
