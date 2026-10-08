-- Private delivery links let a client review one creative delivery without a
-- portal account. The browser receives only an opaque 256-bit token; the
-- database stores its SHA-256 hash and no Dropbox credential is exposed.
CREATE TABLE IF NOT EXISTS public.approval_review_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id uuid NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  last_accessed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_review_share_links_request
  ON public.approval_review_share_links(approval_request_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_review_share_links_active
  ON public.approval_review_share_links(token_hash, expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.approval_review_share_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.approval_review_share_links FROM anon, authenticated;

-- Playback tokens may originate from an authenticated client workspace or a
-- valid no-login delivery link. The stream endpoint still requires its own
-- short-lived playback token.
ALTER TABLE public.dropbox_review_video_playback_tokens
  ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.dropbox_review_video_playback_tokens
  ADD COLUMN IF NOT EXISTS share_link_id uuid NULL REFERENCES public.approval_review_share_links(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_dropbox_review_video_playback_tokens_share_link
  ON public.dropbox_review_video_playback_tokens(share_link_id)
  WHERE share_link_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_creative_review_share_link(
  _approval_request_id uuid
)
RETURNS TABLE(token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _token text;
  _token_hash text;
  _expires_at timestamptz := now() + interval '30 days';
BEGIN
  IF auth.uid() IS NOT NULL
    AND NOT public.has_role(auth.uid(), 'admin')
    AND NOT public.has_role(auth.uid(), 'ops') THEN
    RAISE EXCEPTION 'Only staff can create creative review links';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.approval_requests WHERE id = _approval_request_id) THEN
    RAISE EXCEPTION 'Creative review request was not found';
  END IF;

  _token := encode(extensions.gen_random_bytes(32), 'hex');
  _token_hash := encode(extensions.digest(_token, 'sha256'), 'hex');

  INSERT INTO public.approval_review_share_links (
    approval_request_id,
    token_hash,
    created_by,
    expires_at
  ) VALUES (
    _approval_request_id,
    _token_hash,
    auth.uid(),
    _expires_at
  );

  token := _token;
  expires_at := _expires_at;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_creative_review_share_link(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_creative_review_share_link(uuid) TO authenticated, service_role;

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
  _review_token text;
  _review_expires_at timestamptz;
  _review_link text;
  _escaped_client_name text;
  _escaped_project_name text;
  _escaped_title text;
  _html text;
BEGIN
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

  IF NOT _force AND EXISTS (
    SELECT 1
    FROM public.email_send_log
    WHERE template_name = 'creative_review_request'
      AND metadata->>'approval_request_id' = _approval_request_id::text
      AND status IN ('pending', 'sent')
  ) THEN
    RETURN false;
  END IF;

  -- Each send has its own durable message ID so an intentionally resent link
  -- does not collide with an earlier successfully delivered notification.
  _message_id := 'creative-review-' || _approval_request_id::text || '-' || gen_random_uuid()::text;

  SELECT token, expires_at
  INTO _review_token, _review_expires_at
  FROM public.create_creative_review_share_link(_approval_request_id);
  _review_link := 'https://portal.vektiss.com/review/' || _review_token;

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
    || '<p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 25px;">Open this private Vektiss link to review the ' || _item_count::text || ' ' || _item_label || ' for ' || _escaped_project_name || ', then approve, decline, or share suggestions for each item. No portal login is required for this delivery.</p>'
    || '<a href="' || _review_link || '" style="display: inline-block; background-color: hsl(213, 100%, 58%); color: #ffffff; font-size: 14px; font-weight: 600; border-radius: 6px; padding: 12px 24px; text-decoration: none;">Review creative</a>'
    || '<p style="font-size: 12px; color: #999999; margin: 30px 0 0;">This private review link expires ' || to_char(_review_expires_at, 'Mon FMDD, YYYY') || '. Sign in to Vektiss for the rest of your client workspace.</p>'
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
      'item_count', _item_count,
      'share_link_expires_at', _review_expires_at
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
      'text', 'Hi ' || COALESCE(NULLIF(_client_name, ''), 'there') || ', ' || COALESCE(NULLIF(trim(_title), ''), 'your creative delivery') || ' is ready for review. No portal login is required for this delivery: ' || _review_link || ' This private link expires ' || to_char(_review_expires_at, 'Mon FMDD, YYYY') || '.',
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
