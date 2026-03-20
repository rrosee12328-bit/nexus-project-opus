
CREATE OR REPLACE FUNCTION public.email_on_new_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _client_user_id uuid;
  _client_email text;
  _client_name text;
  _sender_name text;
  _preview text;
  _subject text;
  _html text;
  _msg_id text;
BEGIN
  SELECT user_id, email, name INTO _client_user_id, _client_email, _client_name
  FROM public.clients WHERE id = NEW.client_id;

  IF _client_user_id IS NULL OR _client_email IS NULL OR NEW.sender_id = _client_user_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO _sender_name
  FROM public.profiles WHERE user_id = NEW.sender_id;

  _preview := LEFT(NEW.content, 200);
  _subject := 'New message from ' || COALESCE(_sender_name, 'Vektiss');
  _msg_id := gen_random_uuid()::text;

  _html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
    || '<body style="font-family: Inter, Arial, sans-serif; background-color: #ffffff; padding: 40px 25px;">'
    || '<h1 style="font-size: 24px; font-weight: bold; color: #0d0d0d; margin: 0 0 20px;">You have a new message</h1>'
    || '<p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 10px;">'
    || COALESCE(_sender_name, 'Your Vektiss team') || ' sent you a message:</p>'
    || '<div style="background-color: #f5f5f5; border-left: 4px solid hsl(213, 100%, 58%); padding: 16px; border-radius: 6px; margin: 0 0 25px;">'
    || '<p style="font-size: 14px; color: #333; line-height: 1.6; margin: 0;">'
    || replace(replace(_preview, '&', '&amp;'), '<', '&lt;')
    || CASE WHEN length(NEW.content) > 200 THEN '...' ELSE '' END
    || '</p></div>'
    || '<a href="https://nexus-project-opus.lovable.app/portal/messages" '
    || 'style="display: inline-block; background-color: hsl(213, 100%, 58%); color: #ffffff; font-size: 14px; font-weight: 600; border-radius: 6px; padding: 12px 24px; text-decoration: none;">View Messages</a>'
    || '<p style="font-size: 12px; color: #999999; margin: 30px 0 0;">This is an automated notification from Vektiss.</p>'
    || '</body></html>';

  PERFORM public.enqueue_email(
    'transactional_emails',
    jsonb_build_object(
      'to', _client_email,
      'from', 'Vektiss <noreply@notify.vektiss.com>',
      'sender_domain', 'notify.vektiss.com',
      'subject', _subject,
      'html', _html,
      'text', 'You have a new message from ' || COALESCE(_sender_name, 'Vektiss') || ': ' || _preview,
      'label', 'new_message_notification',
      'message_id', _msg_id,
      'queued_at', now()::text
    )
  );

  RETURN NEW;
END;
$function$;
