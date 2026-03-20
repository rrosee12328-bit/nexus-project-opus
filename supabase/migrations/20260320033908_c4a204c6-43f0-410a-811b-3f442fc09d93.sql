-- Update email_on_new_message trigger function
CREATE OR REPLACE FUNCTION public.email_on_new_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _client_user_id uuid; _client_email text; _client_name text; _sender_name text; _preview text; _subject text; _html text; _msg_id text;
BEGIN
  SELECT user_id, email, name INTO _client_user_id, _client_email, _client_name FROM public.clients WHERE id = NEW.client_id;
  IF _client_user_id IS NULL OR _client_email IS NULL OR NEW.sender_id = _client_user_id THEN RETURN NEW; END IF;
  SELECT display_name INTO _sender_name FROM public.profiles WHERE user_id = NEW.sender_id;
  _preview := LEFT(NEW.content, 200); _subject := 'New message from ' || COALESCE(_sender_name, 'Vektiss'); _msg_id := gen_random_uuid()::text;
  _html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Inter, Arial, sans-serif; background-color: #ffffff; padding: 40px 25px;"><h1 style="font-size: 24px; font-weight: bold; color: #0d0d0d; margin: 0 0 20px;">You have a new message</h1><p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 10px;">' || COALESCE(_sender_name, 'Your Vektiss team') || ' sent you a message:</p><div style="background-color: #f5f5f5; border-left: 4px solid hsl(213, 100%, 58%); padding: 16px; border-radius: 6px; margin: 0 0 25px;"><p style="font-size: 14px; color: #333; line-height: 1.6; margin: 0;">' || replace(replace(_preview, '&', '&amp;'), '<', '&lt;') || CASE WHEN length(NEW.content) > 200 THEN '...' ELSE '' END || '</p></div><a href="https://nexus-project-opus.lovable.app/portal/messages" style="display: inline-block; background-color: hsl(213, 100%, 58%); color: #ffffff; font-size: 14px; font-weight: 600; border-radius: 6px; padding: 12px 24px; text-decoration: none;">View Messages</a><p style="font-size: 12px; color: #999999; margin: 30px 0 0;">This is an automated notification from Vektiss.</p></body></html>';
  PERFORM public.enqueue_email('transactional_emails', jsonb_build_object('to', _client_email, 'from', 'Vektiss <noreply@mail.vektiss.com>', 'sender_domain', 'mail.vektiss.com', 'subject', _subject, 'html', _html, 'text', 'You have a new message from ' || COALESCE(_sender_name, 'Vektiss') || ': ' || _preview, 'purpose', 'transactional', 'label', 'new_message_notification', 'message_id', _msg_id, 'queued_at', now()::text));
  RETURN NEW;
END;
$function$;

-- Update email_on_project_update trigger function
CREATE OR REPLACE FUNCTION public.email_on_project_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _client_email text; _client_name text; _client_user_id uuid; _change_desc text; _subject text; _html text; _msg_id text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status AND OLD.current_phase IS NOT DISTINCT FROM NEW.current_phase THEN RETURN NEW; END IF;
  SELECT email, name, user_id INTO _client_email, _client_name, _client_user_id FROM public.clients WHERE id = NEW.client_id;
  IF _client_email IS NULL THEN RETURN NEW; END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN _change_desc := 'Status changed to <strong style="color: #0d0d0d;">' || REPLACE(NEW.status::text, '_', ' ') || '</strong>';
  ELSIF OLD.current_phase IS DISTINCT FROM NEW.current_phase THEN _change_desc := 'Now in the <strong style="color: #0d0d0d;">' || REPLACE(NEW.current_phase::text, '_', ' ') || '</strong> phase'; END IF;
  _subject := 'Project update: ' || NEW.name; _msg_id := gen_random_uuid()::text;
  _html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Inter, Arial, sans-serif; background-color: #ffffff; padding: 40px 25px;"><h1 style="font-size: 24px; font-weight: bold; color: #0d0d0d; margin: 0 0 20px;">Project Update</h1><p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 10px;">Hi ' || COALESCE(_client_name, 'there') || ',</p><p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 8px;">Your project <strong style="color: #0d0d0d;">' || replace(replace(NEW.name, '&', '&amp;'), '<', '&lt;') || '</strong> has been updated:</p><div style="background-color: #f5f5f5; border-left: 4px solid hsl(213, 100%, 58%); padding: 16px; border-radius: 6px; margin: 0 0 25px;"><p style="font-size: 14px; color: #333; line-height: 1.6; margin: 0;">' || _change_desc || '</p></div><a href="https://nexus-project-opus.lovable.app/portal/projects" style="display: inline-block; background-color: hsl(213, 100%, 58%); color: #ffffff; font-size: 14px; font-weight: 600; border-radius: 6px; padding: 12px 24px; text-decoration: none;">View Project</a><p style="font-size: 12px; color: #999999; margin: 30px 0 0;">This is an automated notification from Vektiss.</p></body></html>';
  PERFORM public.enqueue_email('transactional_emails', jsonb_build_object('to', _client_email, 'from', 'Vektiss <noreply@mail.vektiss.com>', 'sender_domain', 'mail.vektiss.com', 'subject', _subject, 'html', _html, 'text', 'Hi ' || COALESCE(_client_name, 'there') || ', your project "' || NEW.name || '" has been updated.', 'purpose', 'transactional', 'label', 'project_update', 'message_id', _msg_id, 'queued_at', now()::text));
  RETURN NEW;
END;
$function$;

-- Update email_on_payment trigger function
CREATE OR REPLACE FUNCTION public.email_on_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _client_email text; _client_name text; _client_user_id uuid; _month_name text; _subject text; _html text; _msg_id text;
BEGIN
  IF NEW.notes = 'Projected' THEN RETURN NEW; END IF;
  SELECT email, name, user_id INTO _client_email, _client_name, _client_user_id FROM public.clients WHERE id = NEW.client_id;
  IF _client_email IS NULL THEN RETURN NEW; END IF;
  _month_name := (ARRAY['January','February','March','April','May','June','July','August','September','October','November','December'])[NEW.payment_month];
  _subject := 'Payment confirmed — ' || _month_name || ' ' || NEW.payment_year::text; _msg_id := gen_random_uuid()::text;
  _html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Inter, Arial, sans-serif; background-color: #ffffff; padding: 40px 25px;"><h1 style="font-size: 24px; font-weight: bold; color: #0d0d0d; margin: 0 0 20px;">Payment Confirmed</h1><p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 10px;">Hi ' || COALESCE(_client_name, 'there') || ',</p><p style="font-size: 14px; color: #6b6b6b; line-height: 1.6; margin: 0 0 25px;">We''ve recorded a payment of <strong style="color: #0d0d0d;">$' || NEW.amount::text || '</strong> for <strong style="color: #0d0d0d;">' || _month_name || ' ' || NEW.payment_year::text || '</strong>.' || CASE WHEN NEW.notes IS NOT NULL AND NEW.notes != '' THEN '<br/>Note: ' || replace(replace(NEW.notes, '&', '&amp;'), '<', '&lt;') ELSE '' END || '</p><a href="https://nexus-project-opus.lovable.app/portal/payments" style="display: inline-block; background-color: hsl(213, 100%, 58%); color: #ffffff; font-size: 14px; font-weight: 600; border-radius: 6px; padding: 12px 24px; text-decoration: none;">View Payment History</a><p style="font-size: 12px; color: #999999; margin: 30px 0 0;">This is an automated notification from Vektiss.</p></body></html>';
  PERFORM public.enqueue_email('transactional_emails', jsonb_build_object('to', _client_email, 'from', 'Vektiss <noreply@mail.vektiss.com>', 'sender_domain', 'mail.vektiss.com', 'subject', _subject, 'html', _html, 'text', 'Hi ' || COALESCE(_client_name, 'there') || ', a payment of $' || NEW.amount::text || ' for ' || _month_name || ' ' || NEW.payment_year::text || ' has been confirmed.', 'purpose', 'transactional', 'label', 'payment_confirmation', 'message_id', _msg_id, 'queued_at', now()::text));
  RETURN NEW;
END;
$function$;