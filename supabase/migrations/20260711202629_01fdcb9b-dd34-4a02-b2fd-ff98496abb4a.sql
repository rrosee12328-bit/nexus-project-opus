
-- Clean up leftover permissive policies on call_intelligence
DROP POLICY IF EXISTS "allow_admin_insert" ON public.call_intelligence;
DROP POLICY IF EXISTS "Allow service role full access" ON public.call_intelligence;
DROP POLICY IF EXISTS "Allow authenticated inserts on call_intelligence" ON public.call_intelligence;

-- Revoke authenticated EXECUTE on all SECURITY DEFINER functions that return trigger
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_type t ON t.oid = p.prorettype
    WHERE n.nspname='public' AND p.prosecdef=true AND t.typname='trigger'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated, anon, PUBLIC',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- Revoke authenticated EXECUTE on internal-only functions that shouldn't be called by clients
REVOKE EXECUTE ON FUNCTION public.convert_lead_to_proposal(uuid, uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_proposal_to_client(uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_proposal_to_client(uuid, text, text, text, text) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.archive_done_tasks() FROM authenticated, anon, PUBLIC;
