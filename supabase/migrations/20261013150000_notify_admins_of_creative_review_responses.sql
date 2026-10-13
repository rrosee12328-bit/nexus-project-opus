-- Route every client creative-review decision to the internal portal and the
-- central Vektiss inbox. Grouped Dropbox deliveries update one item at a time;
-- legacy single-item requests continue to update the request itself.

CREATE OR REPLACE FUNCTION public.enqueue_creative_review_admin_response_email(
  _approval_request_id uuid,
  _item_id uuid,
  _status text,
  _response_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _request_title text;
  _item_title text;
  _client_name text;
  _project_name text;
  _status_label text;
  _message_id text;
  _escaped_request_title text;
  _escaped_item_title text;
  _escaped_client_name text;
  _escaped_project_name text;
  _escaped_status_label text;
  _escaped_note text;
  _html text;
BEGIN
  IF _status NOT IN ('approved', 'rejected', 'suggestions') THEN
    RAISE EXCEPTION 'Unsupported creative review response status';
  END IF;

  SELECT
    request.title,
    item.title,
    clients.name,
    projects.name
  INTO
    _request_title,
    _item_title,
    _client_name,
    _project_name
  FROM public.approval_requests AS request
  JOIN public.clients AS clients ON clients.id = request.client_id
  JOIN public.projects AS projects ON projects.id = request.project_id
  LEFT JOIN public.approval_request_items AS item
    ON item.id = _item_id
    AND item.approval_request_id = request.id
  WHERE request.id = _approval_request_id;

  IF _request_title IS NULL THEN
    RAISE EXCEPTION 'Creative review request was not found';
  END IF;

  _status_label := CASE _status
    WHEN 'approved' THEN 'Approved'
    WHEN 'rejected' THEN 'Changes requested'
    WHEN 'suggestions' THEN 'Suggestions sent'
  END;

  -- A creative item can receive only one client decision. The stable message ID
  -- preserves that guarantee even if a transaction is retried.
  _message_id := 'creative-review-response-'
    || COALESCE(_item_id::text, _approval_request_id::text)
    || '-' || _status;

  IF EXISTS (
    SELECT 1
    FROM public.email_send_log
    WHERE message_id = _message_id
      AND status IN ('pending', 'sent')
  ) THEN
    RETURN false;
  END IF;

  _escaped_request_title := replace(replace(replace(replace(COALESCE(NULLIF(_request_title, ''), 'Creative delivery'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
  _escaped_item_title := replace(replace(replace(replace(COALESCE(NULLIF(_item_title, ''), _request_title, 'Creative item'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
  _escaped_client_name := replace(replace(replace(replace(COALESCE(NULLIF(_client_name, ''), 'A client'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
  _escaped_project_name := replace(replace(replace(replace(COALESCE(NULLIF(_project_name, ''), 'a project'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
  _escaped_status_label := replace(replace(replace(replace(_status_label, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
  _escaped_note := replace(replace(replace(replace(COALESCE(NULLIF(trim(_response_note), ''), 'No written feedback was provided.'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');

  _html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
    || '<body style="font-family: Inter, Arial, sans-serif; background-color: #ffffff; padding: 40px 25px; color: #0d0d0d;">'
    || '<h1 style="font-size: 24px; font-weight: bold; margin: 0 0 20px;">Client creative review update</h1>'
    || '<p style="font-size: 14px; line-height: 1.6; margin: 0 0 10px;"><strong>' || _escaped_client_name || '</strong> has responded to a creative item.</p>'
    || '<table role="presentation" style="border-collapse: collapse; margin: 20px 0; font-size: 14px; line-height: 1.6;">'
    || '<tr><td style="padding: 4px 16px 4px 0; color: #6b7280;">Project</td><td><strong>' || _escaped_project_name || '</strong></td></tr>'
    || '<tr><td style="padding: 4px 16px 4px 0; color: #6b7280;">Delivery</td><td><strong>' || _escaped_request_title || '</strong></td></tr>'
    || '<tr><td style="padding: 4px 16px 4px 0; color: #6b7280;">Item</td><td><strong>' || _escaped_item_title || '</strong></td></tr>'
    || '<tr><td style="padding: 4px 16px 4px 0; color: #6b7280;">Decision</td><td><strong>' || _escaped_status_label || '</strong></td></tr>'
    || '</table>'
    || '<p style="font-size: 14px; line-height: 1.6; margin: 0 0 8px;"><strong>Client feedback</strong></p>'
    || '<p style="font-size: 14px; line-height: 1.6; margin: 0 0 25px; white-space: pre-wrap;">' || _escaped_note || '</p>'
    || '<a href="https://portal.vektiss.com/ops/reviews" style="display: inline-block; background-color: #2485f6; color: #ffffff; font-size: 14px; font-weight: 600; border-radius: 6px; padding: 12px 24px; text-decoration: none;">Open creative reviews</a>'
    || '<p style="font-size: 12px; color: #6b7280; margin: 30px 0 0;">This is an automated Vektiss portal notification.</p>'
    || '</body></html>';

  INSERT INTO public.email_send_log (
    message_id,
    template_name,
    recipient_email,
    status,
    metadata
  ) VALUES (
    _message_id,
    'creative_review_response_admin',
    'info@vektiss.com',
    'pending',
    jsonb_build_object(
      'approval_request_id', _approval_request_id,
      'approval_request_item_id', _item_id,
      'response_status', _status
    )
  );

  PERFORM public.enqueue_email(
    'transactional_emails',
    jsonb_build_object(
      'to', 'info@vektiss.com',
      'from', 'Vektiss <client@vektiss.com>',
      'sender_domain', 'vektiss.com',
      'subject', 'Creative ' || lower(_status_label) || ': ' || COALESCE(NULLIF(_item_title, ''), _request_title),
      'html', _html,
      'text', _client_name || ' responded to ' || COALESCE(NULLIF(_item_title, ''), _request_title)
        || ' in ' || _project_name || '. Decision: ' || _status_label || '. Feedback: '
        || COALESCE(NULLIF(trim(_response_note), ''), 'No written feedback was provided.')
        || '. Open creative reviews: https://portal.vektiss.com/ops/reviews',
      'label', 'creative_review_response_admin',
      'message_id', _message_id,
      'queued_at', now()::text
    )
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_creative_review_admin_response_email(uuid, uuid, text, text) FROM PUBLIC;

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
    FROM public.approval_requests
    WHERE id = NEW.approval_request_id;

    _status_label := CASE NEW.status
      WHEN 'approved' THEN 'approved'
      WHEN 'rejected' THEN 'declined / changes requested'
      WHEN 'suggestions' THEN 'suggestions sent'
    END;

    FOR _recipient IN
      SELECT user_id, role
      FROM public.user_roles
      WHERE role IN ('admin', 'ops')
    LOOP
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (
        _recipient.user_id,
        _review_title || ' · ' || NEW.title || ' — ' || _status_label,
        COALESCE(NEW.response_note, 'The client ' || _status_label || ' this creative item.'),
        'project',
        CASE
          WHEN _recipient.role = 'admin' THEN '/admin/clients/' || _client_id || '?tab=projects'
          ELSE '/ops/reviews'
        END
      );
    END LOOP;

    PERFORM public.enqueue_creative_review_admin_response_email(
      NEW.approval_request_id,
      NEW.id,
      NEW.status,
      NEW.response_note
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_approval_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _recipient record;
  _status_label text;
BEGIN
  IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected', 'suggestions') THEN
    _status_label := CASE NEW.status
      WHEN 'approved' THEN 'approved'
      WHEN 'rejected' THEN 'declined / changes requested'
      WHEN 'suggestions' THEN 'suggestions sent'
    END;

    FOR _recipient IN
      SELECT user_id, role
      FROM public.user_roles
      WHERE role IN ('admin', 'ops')
    LOOP
      INSERT INTO public.notifications (user_id, title, body, type, link)
      VALUES (
        _recipient.user_id,
        NEW.title || ' — ' || _status_label,
        COALESCE(NEW.response_note, 'The client ' || _status_label || ' this creative delivery.'),
        'project',
        CASE
          WHEN _recipient.role = 'admin' THEN '/admin/clients/' || NEW.client_id || '?tab=projects'
          ELSE '/ops/reviews'
        END
      );
    END LOOP;

    -- Grouped deliveries already queue one internal email for each creative
    -- item. This covers only legacy one-item approval requests without sending
    -- a duplicate email when the final grouped item updates its parent request.
    IF NOT EXISTS (
      SELECT 1
      FROM public.approval_request_items
      WHERE approval_request_id = NEW.id
    ) THEN
      PERFORM public.enqueue_creative_review_admin_response_email(
        NEW.id,
        NULL,
        NEW.status,
        NEW.response_note
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
