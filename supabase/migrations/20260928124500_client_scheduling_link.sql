CREATE OR REPLACE FUNCTION public.get_client_scheduling_url()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN onboarding_calendly_url ~ '^https://([a-z0-9-]+\.)?calendly\.com/'
      THEN onboarding_calendly_url
    ELSE NULL
  END
  FROM public.business_settings
  WHERE singleton = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_client_scheduling_url() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_scheduling_url() TO authenticated;
