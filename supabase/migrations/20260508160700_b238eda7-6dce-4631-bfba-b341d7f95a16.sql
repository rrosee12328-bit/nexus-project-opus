-- Notify + email admins/ops when client uploads an asset
CREATE OR REPLACE FUNCTION public.notify_on_client_asset_upload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _client_user_id uuid;
  _client_name text;
  _uploader_role app_role;
  _staff RECORD;
  _subject text;
  _html text;
  _text_body text;
BEGIN
  SELECT user_id, name INTO _client_user_id, _client_name
  FROM public.clients WHERE id = NEW.client_id;

  -- Only fire when the uploader is the client themselves (not admin/ops uploading deliverables)
  IF _client_user_id IS NULL OR NEW.uploaded_by IS NULL OR NEW.uploaded_by != _client_user_id THEN
    RETURN NEW;
  END IF;

  _subject := 'New file from ' || COALESCE(_client_name, 'a client') || ': ' || NEW.file_name;
  _text_body := COALESCE(_client_name, 'A client') || ' uploaded "' || NEW.file_name || '".';

  _html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Inter, Arial, sans-serif; background-color: #ffffff; padding: 40px 25px;">'
    || '<h1 style="font-size: 24px; font-weight: bold; color: #0d0d0d; margin: 0 0 20px;">New Client Upload</h1>'
    || '<p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 25px;"><strong style="color: #0d0d0d;">'
    || replace(replace(COALESCE(_client_name, 'A client'), '&', '&amp;'), '<', '&lt;')
    || '</strong> just uploaded a file: "<strong style="color: #0d0d0d;">'
    || replace(replace(NEW.file_name, '&', '&amp;'), '<', '&lt;')
    || '</strong>".</p>'
    || '<a href="https://nexus-project-opus.lovable.app/admin/assets" style="display: inline-block; background-color: hsl(213, 100%, 58%); color: #ffffff; font-size: 14px; font-weight: 600; border-radius: 6px; padding: 12px 24px; text-decoration: none;">View Asset</a>'
    || '<p style="font-size: 12px; color: #999999; margin: 30px 0 0;">This is an automated notification from Vektiss.</p></body></html>';

  FOR _staff IN
    SELECT DISTINCT ur.user_id, u.email
    FROM public.user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    WHERE ur.role IN ('admin'::app_role, 'ops'::app_role)
  LOOP
    -- In-app notification
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (
      _staff.user_id,
      'New upload from ' || COALESCE(_client_name, 'client'),
      NEW.file_name,
      'message',
      '/admin/assets'
    );

    -- Email
    IF _staff.email IS NOT NULL THEN
      PERFORM public.enqueue_email('transactional_emails', jsonb_build_object(
        'to', _staff.email,
        'from', 'Vektiss <noreply@mail.vektiss.com>',
        'sender_domain', 'mail.vektiss.com',
        'subject', _subject,
        'html', _html,
        'text', _text_body,
        'purpose', 'transactional',
        'label', 'client_asset_upload',
        'message_id', gen_random_uuid()::text,
        'queued_at', now()::text
      ));
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_client_asset_upload ON public.assets;
CREATE TRIGGER trg_notify_on_client_asset_upload
AFTER INSERT ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.notify_on_client_asset_upload();

-- Email admins/ops when a client sends a message
CREATE OR REPLACE FUNCTION public.email_admins_on_client_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _client_user_id uuid;
  _client_name text;
  _staff RECORD;
  _subject text;
  _preview text;
  _html text;
BEGIN
  SELECT user_id, name INTO _client_user_id, _client_name
  FROM public.clients WHERE id = NEW.client_id;

  -- Only when client (not admin/ops) sent the message
  IF _client_user_id IS NULL OR NEW.sender_id != _client_user_id THEN
    RETURN NEW;
  END IF;

  _preview := LEFT(COALESCE(NEW.content, '(attachment)'), 200);
  _subject := 'New message from ' || COALESCE(_client_name, 'a client');

  _html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Inter, Arial, sans-serif; background-color: #ffffff; padding: 40px 25px;">'
    || '<h1 style="font-size: 24px; font-weight: bold; color: #0d0d0d; margin: 0 0 20px;">New Client Message</h1>'
    || '<p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 10px;"><strong style="color: #0d0d0d;">'
    || replace(replace(COALESCE(_client_name, 'A client'), '&', '&amp;'), '<', '&lt;')
    || '</strong> sent a message:</p>'
    || '<div style="background-color: #f5f5f5; border-left: 4px solid hsl(213, 100%, 58%); padding: 16px; border-radius: 6px; margin: 0 0 25px;">'
    || '<p style="font-size: 14px; color: #333; line-height: 1.6; margin: 0;">'
    || replace(replace(_preview, '&', '&amp;'), '<', '&lt;')
    || CASE WHEN length(COALESCE(NEW.content,'')) > 200 THEN '...' ELSE '' END
    || '</p></div>'
    || '<a href="https://nexus-project-opus.lovable.app/admin/messages" style="display: inline-block; background-color: hsl(213, 100%, 58%); color: #ffffff; font-size: 14px; font-weight: 600; border-radius: 6px; padding: 12px 24px; text-decoration: none;">View Messages</a>'
    || '<p style="font-size: 12px; color: #999999; margin: 30px 0 0;">This is an automated notification from Vektiss.</p></body></html>';

  FOR _staff IN
    SELECT DISTINCT ur.user_id, u.email
    FROM public.user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    WHERE ur.role IN ('admin'::app_role, 'ops'::app_role)
  LOOP
    IF _staff.email IS NOT NULL THEN
      PERFORM public.enqueue_email('transactional_emails', jsonb_build_object(
        'to', _staff.email,
        'from', 'Vektiss <noreply@mail.vektiss.com>',
        'sender_domain', 'mail.vektiss.com',
        'subject', _subject,
        'html', _html,
        'text', COALESCE(_client_name, 'A client') || ' sent: ' || _preview,
        'purpose', 'transactional',
        'label', 'client_message_to_staff',
        'message_id', gen_random_uuid()::text,
        'queued_at', now()::text
      ));
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_admins_on_client_message ON public.messages;
CREATE TRIGGER trg_email_admins_on_client_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.email_admins_on_client_message();