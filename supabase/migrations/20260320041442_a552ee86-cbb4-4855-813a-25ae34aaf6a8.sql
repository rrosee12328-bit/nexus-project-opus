
CREATE OR REPLACE FUNCTION public.auto_invite_on_first_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _client_email text;
  _client_user_id uuid;
  _supabase_url text;
  _service_role_key text;
BEGIN
  -- Skip projected payments
  IF NEW.notes = 'Projected' THEN
    RETURN NEW;
  END IF;

  -- Check if client has email but no user_id
  SELECT email, user_id INTO _client_email, _client_user_id
  FROM public.clients WHERE id = NEW.client_id;

  IF _client_email IS NULL OR _client_user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Call the invite-client edge function via pg_net
  SELECT decrypted_secret INTO _supabase_url
  FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;

  SELECT decrypted_secret INTO _service_role_key
  FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1;

  -- If vault secrets aren't available, try env-based approach
  IF _supabase_url IS NULL THEN
    _supabase_url := current_setting('app.settings.supabase_url', true);
  END IF;
  IF _service_role_key IS NULL THEN
    _service_role_key := current_setting('app.settings.service_role_key', true);
  END IF;

  -- Use pg_net to call the edge function asynchronously
  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/invite-client',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    body := jsonb_build_object('client_id', NEW.client_id)
  );

  RETURN NEW;
END;
$function$;

CREATE TRIGGER auto_invite_on_first_payment
  AFTER INSERT ON public.client_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_invite_on_first_payment();
