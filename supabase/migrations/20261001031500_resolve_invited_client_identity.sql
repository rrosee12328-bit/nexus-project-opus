-- Portal invitations link auth users through clients.user_id.  The earlier helper
-- only consulted profiles.client_id, leaving newly invited clients unable to see
-- their project or complete the portal-activation step.
CREATE OR REPLACE FUNCTION public.get_client_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT id FROM public.clients WHERE user_id = _user_id LIMIT 1),
    (SELECT client_id FROM public.profiles WHERE user_id = _user_id LIMIT 1)
  );
$$;

REVOKE ALL ON FUNCTION public.get_client_id_for_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_id_for_user(uuid) TO authenticated;
