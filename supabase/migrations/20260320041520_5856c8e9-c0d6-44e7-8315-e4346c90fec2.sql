
CREATE OR REPLACE FUNCTION public.auto_invite_on_first_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _client_email text;
  _client_user_id uuid;
  _service_role_key text;
BEGIN
  IF NEW.notes = 'Projected' THEN
    RETURN NEW;
  END IF;

  SELECT email, user_id INTO _client_email, _client_user_id
  FROM public.clients WHERE id = NEW.client_id;

  IF _client_email IS NULL OR _client_user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO _service_role_key
  FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;

  IF _service_role_key IS NULL THEN
    RAISE WARNING 'invite-client: no service role key found in vault';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://xtftehtsfnxsdsfmwkew.supabase.co/functions/v1/invite-client',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    body := jsonb_build_object('client_id', NEW.client_id)
  );

  RETURN NEW;
END;
$function$;
