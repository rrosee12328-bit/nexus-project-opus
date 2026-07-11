
-- =========================
-- 1. Enable RLS on missing tables
-- =========================
ALTER TABLE public.call_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_tracking_codes ENABLE ROW LEVEL SECURITY;

-- call_intelligence policies (admin/ops full, clients read own)
DROP POLICY IF EXISTS "admin_ops_manage_call_intelligence" ON public.call_intelligence;
CREATE POLICY "admin_ops_manage_call_intelligence"
  ON public.call_intelligence FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));

DROP POLICY IF EXISTS "clients_read_own_call_intelligence" ON public.call_intelligence;
CREATE POLICY "clients_read_own_call_intelligence"
  ON public.call_intelligence FOR SELECT TO authenticated
  USING (client_id = public.get_client_id_for_user(auth.uid()));

-- email_intelligence policies
DROP POLICY IF EXISTS "admin_ops_manage_email_intelligence" ON public.email_intelligence;
CREATE POLICY "admin_ops_manage_email_intelligence"
  ON public.email_intelligence FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));

-- leads policies (admin/ops only)
DROP POLICY IF EXISTS "admin_ops_manage_leads" ON public.leads;
CREATE POLICY "admin_ops_manage_leads"
  ON public.leads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));

-- time_tracking_codes (authenticated read; admin/ops manage)
DROP POLICY IF EXISTS "authenticated_read_time_tracking_codes" ON public.time_tracking_codes;
CREATE POLICY "authenticated_read_time_tracking_codes"
  ON public.time_tracking_codes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_ops_manage_time_tracking_codes" ON public.time_tracking_codes;
CREATE POLICY "admin_ops_manage_time_tracking_codes"
  ON public.time_tracking_codes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));

-- vendors (RLS is on but no policies) - admin/ops manage
DROP POLICY IF EXISTS "admin_ops_manage_vendors" ON public.vendors;
CREATE POLICY "admin_ops_manage_vendors"
  ON public.vendors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));

-- =========================
-- 2. Fix over-permissive policies
-- =========================

-- audit_log: admin/ops SELECT only
DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.audit_log;
DROP POLICY IF EXISTS "admin_ops_read_audit_log" ON public.audit_log;
CREATE POLICY "admin_ops_read_audit_log"
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));

-- checklist_items: scope by client's project, plus admin/ops manage
DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.checklist_items;
DROP POLICY IF EXISTS "admin_ops_manage_checklist_items" ON public.checklist_items;
DROP POLICY IF EXISTS "clients_read_own_checklist_items" ON public.checklist_items;

CREATE POLICY "admin_ops_manage_checklist_items"
  ON public.checklist_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));

CREATE POLICY "clients_read_own_checklist_items"
  ON public.checklist_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = checklist_items.project_id
      AND p.client_id = public.get_client_id_for_user(auth.uid())
  ));

-- content_assets: admin/ops manage, clients read own
DROP POLICY IF EXISTS "Authenticated users can manage content_assets" ON public.content_assets;
DROP POLICY IF EXISTS "admin_ops_manage_content_assets" ON public.content_assets;
DROP POLICY IF EXISTS "clients_read_own_content_assets" ON public.content_assets;

CREATE POLICY "admin_ops_manage_content_assets"
  ON public.content_assets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));

CREATE POLICY "clients_read_own_content_assets"
  ON public.content_assets FOR SELECT TO authenticated
  USING (client_id = public.get_client_id_for_user(auth.uid()));

-- offers: admin/ops manage, clients read own
DROP POLICY IF EXISTS "Authenticated users can manage offers" ON public.offers;
DROP POLICY IF EXISTS "admin_ops_manage_offers" ON public.offers;
DROP POLICY IF EXISTS "clients_read_own_offers" ON public.offers;

CREATE POLICY "admin_ops_manage_offers"
  ON public.offers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));

CREATE POLICY "clients_read_own_offers"
  ON public.offers FOR SELECT TO authenticated
  USING (client_id = public.get_client_id_for_user(auth.uid()));

-- strategic_insights: admin/ops only
DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.strategic_insights;
DROP POLICY IF EXISTS "admin_ops_manage_strategic_insights" ON public.strategic_insights;
CREATE POLICY "admin_ops_manage_strategic_insights"
  ON public.strategic_insights FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));

-- timesheets: owner + admin/ops
DROP POLICY IF EXISTS "Authenticated users can read timesheets" ON public.timesheets;
DROP POLICY IF EXISTS "Authenticated users can insert timesheets" ON public.timesheets;
DROP POLICY IF EXISTS "Authenticated users can update timesheets" ON public.timesheets;
DROP POLICY IF EXISTS "Authenticated users can delete timesheets" ON public.timesheets;
DROP POLICY IF EXISTS "owner_admin_ops_read_timesheets" ON public.timesheets;
DROP POLICY IF EXISTS "owner_insert_timesheets" ON public.timesheets;
DROP POLICY IF EXISTS "owner_admin_ops_update_timesheets" ON public.timesheets;
DROP POLICY IF EXISTS "owner_admin_ops_delete_timesheets" ON public.timesheets;

CREATE POLICY "owner_admin_ops_read_timesheets"
  ON public.timesheets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));

CREATE POLICY "owner_insert_timesheets"
  ON public.timesheets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));

CREATE POLICY "owner_admin_ops_update_timesheets"
  ON public.timesheets FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));

CREATE POLICY "owner_admin_ops_delete_timesheets"
  ON public.timesheets FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops'));

-- =========================
-- 3. Proposals: remove anon SELECT; add secure token-based RPC
-- =========================
DROP POLICY IF EXISTS "Anyone can view proposal by token" ON public.proposals;

CREATE OR REPLACE FUNCTION public.get_proposal_by_token(_token text)
RETURNS SETOF public.proposals
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.proposals WHERE token = _token LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_proposal_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_proposal_by_token(text) TO anon, authenticated;

-- =========================
-- 4. Storage: avatars bucket listing restricted to owners
-- =========================
DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;
CREATE POLICY "Owners can list own avatars"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND ((storage.foldername(name))[1] = auth.uid()::text));

-- =========================
-- 5. Realtime.messages baseline: authenticated only
-- =========================
DO $$ BEGIN
  ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN insufficient_privilege THEN NULL;
WHEN undefined_table THEN NULL;
END $$;

DROP POLICY IF EXISTS "authenticated_realtime_access" ON realtime.messages;
DO $$ BEGIN
  CREATE POLICY "authenticated_realtime_access"
    ON realtime.messages FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN insufficient_privilege THEN NULL;
WHEN undefined_table THEN NULL;
END $$;

-- =========================
-- 6. Fix search_path on remaining functions
-- =========================
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.update_timesheets_updated_at() SET search_path = public;
ALTER FUNCTION public.prevent_audit_log_modification() SET search_path = public;
ALTER FUNCTION public.generate_client_number() SET search_path = public;
ALTER FUNCTION public.generate_project_number() SET search_path = public;
ALTER FUNCTION public.generate_proposal_number() SET search_path = public;
ALTER FUNCTION public.generate_vendor_number() SET search_path = public;
ALTER FUNCTION public.auto_advance_project_phase() SET search_path = public;
ALTER FUNCTION public.auto_populate_project_checklist() SET search_path = public;
ALTER FUNCTION public.convert_lead_to_proposal(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.convert_proposal_to_client(uuid) SET search_path = public;
ALTER FUNCTION public.convert_proposal_to_client(uuid, text, text, text, text) SET search_path = public;
ALTER FUNCTION public.recalculate_project_progress() SET search_path = public;
ALTER FUNCTION public.trigger_proposal_to_client() SET search_path = public;

-- =========================
-- 7. Revoke anon EXECUTE on SECURITY DEFINER functions (keep authenticated where policies need them)
-- =========================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, PUBLIC',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- Keep authenticated EXECUTE on RLS helpers
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_id_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;

-- Revoke authenticated EXECUTE on internal trigger/queue functions that should never be called directly
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_client_summary_refresh(uuid) FROM authenticated;
