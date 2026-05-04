
-- Auto-trigger analyze-call when a call gets a summary or summary is updated
CREATE OR REPLACE FUNCTION public.trg_auto_analyze_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _service_role_key text;
  _supabase_url text;
BEGIN
  -- Only fire when summary is present and analysis missing
  IF NEW.summary IS NULL OR NEW.summary = '' THEN RETURN NEW; END IF;
  IF NEW.ai_analysis IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.summary IS NOT DISTINCT FROM NEW.summary AND OLD.ai_analysis IS NOT DISTINCT FROM NEW.ai_analysis THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO _service_role_key
    FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    _service_role_key := NULL;
  END;
  IF _service_role_key IS NULL THEN RETURN NEW; END IF;

  BEGIN
    SELECT decrypted_secret INTO _supabase_url
    FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    _supabase_url := NULL;
  END;
  IF _supabase_url IS NULL OR _supabase_url = '' THEN
    _supabase_url := 'https://xtftehtsfnxsdsfmwkew.supabase.co';
  END IF;

  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/analyze-call',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    body := jsonb_build_object('call_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_analyze_call_insert ON public.call_intelligence;
CREATE TRIGGER auto_analyze_call_insert
AFTER INSERT ON public.call_intelligence
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_analyze_call();

DROP TRIGGER IF EXISTS auto_analyze_call_update ON public.call_intelligence;
CREATE TRIGGER auto_analyze_call_update
AFTER UPDATE ON public.call_intelligence
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_analyze_call();
