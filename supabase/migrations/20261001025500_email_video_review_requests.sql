-- A video delivery must create a review record, ensure portal access in the UI,
-- and queue a transactional notification for the client.
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
  _client_email text;
  _client_name text;
  _project_name text;
  _message_id text;
  _escaped_client_name text;
  _escaped_title text;
  _video_label text;
  _html text;
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

  SELECT projects.client_id, clients.email, clients.name, projects.name
  INTO _client_id, _client_email, _client_name, _project_name
  FROM public.projects AS projects
  JOIN public.clients AS clients ON clients.id = projects.client_id
  WHERE projects.id = _project_id;

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

  -- The client receives a portal notification after their workspace invitation
  -- has been queued by the calling workflow (when needed).
  IF NULLIF(trim(COALESCE(_client_email, '')), '') IS NOT NULL THEN
    _message_id := 'video-review-' || _request_id::text;
    _video_label := CASE WHEN _position = 1 THEN 'video' ELSE 'videos' END;
    _escaped_client_name := replace(replace(replace(replace(COALESCE(NULLIF(_client_name, ''), 'there'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
    _escaped_title := replace(replace(replace(replace(trim(_title), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
    _html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
      || '<body style="font-family: Inter, Arial, sans-serif; background-color: #ffffff; padding: 40px 25px;">'
      || '<h1 style="font-size: 24px; font-weight: bold; color: #0d0d0d; margin: 0 0 20px;">Videos ready for your review</h1>'
      || '<p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 10px;">Hi ' || _escaped_client_name || ',</p>'
      || '<p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 25px;">'
      || '<strong style="color: #0d0d0d;">' || _escaped_title || '</strong> is ready. Please review the ' || _position::text || ' ' || _video_label || ' in your Vektiss workspace and approve, decline, or share suggestions for each one.</p>'
      || '<a href="https://portal.vektiss.com/portal/approvals" style="display: inline-block; background-color: hsl(213, 100%, 58%); color: #ffffff; font-size: 14px; font-weight: 600; border-radius: 6px; padding: 12px 24px; text-decoration: none;">Review videos</a>'
      || '<p style="font-size: 12px; color: #999999; margin: 30px 0 0;">This is an automated notification from Vektiss.</p>'
      || '</body></html>';

    PERFORM public.enqueue_email(
      'transactional_emails',
      jsonb_build_object(
        'to', trim(_client_email),
        'from', 'Vektiss <client@vektiss.com>',
        'sender_domain', 'vektiss.com',
        'subject', 'Videos ready for review: ' || trim(_title),
        'html', _html,
        'text', 'Hi ' || COALESCE(NULLIF(_client_name, ''), 'there') || ', ' || trim(_title) || ' is ready. Review the ' || _position::text || ' ' || _video_label || ' in your Vektiss workspace: https://portal.vektiss.com/portal/approvals',
        'label', 'video_review_request',
        'message_id', _message_id,
        'queued_at', now()::text
      )
    );
  END IF;

  RETURN _request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_video_review_request(uuid, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_video_review_request(uuid, text, text, text, text, jsonb) TO authenticated;
