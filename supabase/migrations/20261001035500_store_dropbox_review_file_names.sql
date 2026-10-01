-- Keep the exact imported filename so an in-portal review player can resolve a
-- folder entry even if staff later use a friendlier client-facing title.
ALTER TABLE public.approval_request_items
  ADD COLUMN IF NOT EXISTS source_file_name text;

ALTER TABLE public.approval_request_items
  DROP CONSTRAINT IF EXISTS approval_request_items_source_file_name_check;
ALTER TABLE public.approval_request_items
  ADD CONSTRAINT approval_request_items_source_file_name_check
  CHECK (source_file_name IS NULL OR length(trim(source_file_name)) > 0);

CREATE OR REPLACE FUNCTION public.enforce_approval_review_item_response_update()
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
    NEW.source_file_name := OLD.source_file_name;
    NEW.position := OLD.position;
    NEW.created_at := OLD.created_at;
    NEW.responded_at := now();
  END IF;
  RETURN NEW;
END;
$$;

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
  _source_file_name text;
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
    _source_file_name := NULLIF(trim(COALESCE(_item->>'source_file_name', '')), '');

    IF _item_title IS NULL THEN
      RAISE EXCEPTION 'Every video needs a title';
    END IF;
    IF _item_url !~ '^https://([[:alnum:]-]+\.)*(dropbox\.com|dropboxusercontent\.com)/' THEN
      RAISE EXCEPTION 'Video review links must be secure Dropbox shared links';
    END IF;

    INSERT INTO public.approval_request_items (approval_request_id, title, review_url, source_file_name, position)
    VALUES (_request_id, _item_title, _item_url, _source_file_name, _position);
  END LOOP;

  RETURN _request_id;
END;
$$;
