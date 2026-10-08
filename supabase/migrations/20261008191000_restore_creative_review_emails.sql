-- The Dropbox filename migration replaced create_video_review_request and
-- unintentionally removed its client-notification block. Keep delivery email
-- generation in a dedicated helper so later review-schema changes cannot drop it.
CREATE OR REPLACE FUNCTION public.enqueue_creative_review_notification(
  _approval_request_id uuid,
  _force boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _client_id uuid;
  _client_email text;
  _client_name text;
  _project_id uuid;
  _project_name text;
  _title text;
  _item_count integer;
  _message_id text;
  _item_label text;
  _escaped_client_name text;
  _escaped_project_name text;
  _escaped_title text;
  _html text;
BEGIN
  -- Calls from the Edge Functions/service role do not have an auth.uid().
  -- Browser callers must still be approved staff.
  IF auth.uid() IS NOT NULL
    AND NOT public.has_role(auth.uid(), 'admin')
    AND NOT public.has_role(auth.uid(), 'ops') THEN
    RAISE EXCEPTION 'Only staff can send creative review notifications';
  END IF;

  SELECT
    request.client_id,
    clients.email,
    clients.name,
    request.project_id,
    projects.name,
    request.title,
    (SELECT count(*)::integer FROM public.approval_request_items items WHERE items.approval_request_id = request.id)
  INTO
    _client_id,
    _client_email,
    _client_name,
    _project_id,
    _project_name,
    _title,
    _item_count
  FROM public.approval_requests request
  JOIN public.clients clients ON clients.id = request.client_id
  JOIN public.projects projects ON projects.id = request.project_id
  WHERE request.id = _approval_request_id;

  IF _client_id IS NULL THEN
    RAISE EXCEPTION 'Creative review request was not found';
  END IF;

  IF NULLIF(trim(COALESCE(_client_email, '')), '') IS NULL THEN
    RETURN false;
  END IF;

  _message_id := 'creative-review-' || _approval_request_id::text;

  -- Do not send a duplicate notification for an already queued or delivered
  -- review unless a staff recovery explicitly requests it.
  IF NOT _force AND EXISTS (
    SELECT 1
    FROM public.email_send_log
    WHERE message_id = _message_id
      AND status IN ('pending', 'sent')
  ) THEN
    RETURN false;
  END IF;

  _item_count := GREATEST(COALESCE(_item_count, 0), 1);
  _item_label := CASE WHEN _item_count = 1 THEN 'creative item' ELSE 'creative items' END;
  _escaped_client_name := replace(replace(replace(replace(COALESCE(NULLIF(_client_name, ''), 'there'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
  _escaped_project_name := replace(replace(replace(replace(COALESCE(NULLIF(_project_name, ''), 'your project'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
  _escaped_title := replace(replace(replace(replace(COALESCE(NULLIF(_title, ''), 'Your creative delivery'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');

  _html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
    || '<body style="font-family: Inter, Arial, sans-serif; background-color: #ffffff; padding: 40px 25px;">'
    || '<h1 style="font-size: 24px; font-weight: bold; color: #0d0d0d; margin: 0 0 20px;">Creative ready for your review</h1>'
    || '<p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 10px;">Hi ' || _escaped_client_name || ',</p>'
    || '<p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 10px;"><strong style="color: #0d0d0d;">' || _escaped_title || '</strong> is ready for your review.</p>'
    || '<p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 25px;">Open your Vektiss workspace to review the ' || _item_count::text || ' ' || _item_label || ' for ' || _escaped_project_name || ', then approve, decline, or share suggestions for each item.</p>'
    || '<a href="https://portal.vektiss.com/portal/approvals" style="display: inline-block; background-color: hsl(213, 100%, 58%); color: #ffffff; font-size: 14px; font-weight: 600; border-radius: 6px; padding: 12px 24px; text-decoration: none;">Review creative</a>'
    || '<p style="font-size: 12px; color: #999999; margin: 30px 0 0;">This is an automated notification from Vektiss.</p>'
    || '</body></html>';

  INSERT INTO public.email_send_log (
    message_id,
    template_name,
    recipient_email,
    status,
    metadata
  ) VALUES (
    _message_id,
    'creative_review_request',
    trim(_client_email),
    'pending',
    jsonb_build_object(
      'approval_request_id', _approval_request_id,
      'client_id', _client_id,
      'project_id', _project_id,
      'item_count', _item_count
    )
  );

  PERFORM public.enqueue_email(
    'transactional_emails',
    jsonb_build_object(
      'to', trim(_client_email),
      'from', 'Vektiss <client@vektiss.com>',
      'sender_domain', 'vektiss.com',
      'subject', 'Creative ready for review: ' || COALESCE(NULLIF(trim(_title), ''), 'Your Vektiss delivery'),
      'html', _html,
      'text', 'Hi ' || COALESCE(NULLIF(_client_name, ''), 'there') || ', ' || COALESCE(NULLIF(trim(_title), ''), 'your creative delivery') || ' is ready for review. Open Vektiss to review the ' || _item_count::text || ' ' || _item_label || ' for ' || COALESCE(NULLIF(_project_name, ''), 'your project') || ': https://portal.vektiss.com/portal/approvals',
      'label', 'creative_review_request',
      'message_id', _message_id,
      'queued_at', now()::text
    )
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_creative_review_notification(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_creative_review_notification(uuid, boolean) TO authenticated, service_role;

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

  PERFORM public.enqueue_creative_review_notification(_request_id);

  RETURN _request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_video_review_request(uuid, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_video_review_request(uuid, text, text, text, text, jsonb) TO authenticated;
