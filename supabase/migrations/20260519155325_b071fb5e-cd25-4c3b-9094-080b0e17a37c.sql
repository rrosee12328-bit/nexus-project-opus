CREATE OR REPLACE FUNCTION public.prevent_duplicate_call_intelligence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.fathom_meeting_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.call_intelligence ci
    WHERE ci.fathom_meeting_id IS NULL
      AND COALESCE(ci.client_id::text,'') = COALESCE(NEW.client_id::text,'')
      AND ci.call_type = NEW.call_type
      AND ABS(EXTRACT(EPOCH FROM (ci.call_date - NEW.call_date))) < 90
      AND LEFT(COALESCE(ci.summary,''), 120) = LEFT(COALESCE(NEW.summary,''), 120)
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_dup_call_intelligence ON public.call_intelligence;
CREATE TRIGGER trg_prevent_dup_call_intelligence
BEFORE INSERT ON public.call_intelligence
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_call_intelligence();