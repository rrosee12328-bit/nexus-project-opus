CREATE OR REPLACE FUNCTION public.auto_invite_on_first_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _client_email text;
  _client_user_id uuid;
  _client_status text;
  _service_role_key text;
  _supabase_url text;
BEGIN
  -- Skip projected payments
  IF NEW.notes = 'Projected' THEN
    RETURN NEW;
  END IF;

  SELECT email, user_id, status::text INTO _client_email, _client_user_id, _client_status
  FROM public.clients WHERE id = NEW.client_id;

  -- Skip if no email, already has a user, or already in onboarding/active state
  IF _client_email IS NULL OR _client_user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Guard against race condition: atomically set status to 'onboarding'
  -- Only proceeds if status is still 'prospect' or 'lead' (not yet invited)
  UPDATE public.clients
  SET status = 'onboarding'
  WHERE id = NEW.client_id
    AND status IN ('prospect', 'lead');

  -- If no row was updated, another payment already triggered the invite
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO _service_role_key
  FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;

  IF _service_role_key IS NULL THEN
    RAISE WARNING 'invite-client: no service role key found in vault';
    -- Revert status since we can't proceed
    UPDATE public.clients SET status = _client_status::client_status WHERE id = NEW.client_id;
    RETURN NEW;
  END IF;

  -- Use dynamic URL from environment instead of hard-coded project URL
  SELECT decrypted_secret INTO _supabase_url
  FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;

  IF _supabase_url IS NULL THEN
    -- Fallback: construct from current_setting if available
    _supabase_url := current_setting('app.settings.supabase_url', true);
  END IF;

  IF _supabase_url IS NULL OR _supabase_url = '' THEN
    _supabase_url := 'https://xtftehtsfnxsdsfmwkew.supabase.co';
  END IF;

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
$$;