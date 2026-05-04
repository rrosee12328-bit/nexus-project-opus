
-- Trigger function for client_contracts audit
CREATE OR REPLACE FUNCTION public.audit_client_contract_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_type text := CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'human' END;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_id, actor_type, action_type, target_table, target_id, new_data, risk_tier)
    VALUES (v_actor, v_actor_type, 'contract_linked', 'client_contracts', NEW.id,
      jsonb_build_object(
        'client_id', NEW.client_id,
        'title', NEW.title,
        'file_path', NEW.file_path,
        'contract_type', NEW.contract_type,
        'signed_at', NEW.signed_at,
        'signed_by', NEW.signed_by,
        'monthly_fee', NEW.monthly_fee,
        'setup_fee', NEW.setup_fee
      ),
      'medium');
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (actor_id, actor_type, action_type, target_table, target_id, old_data, risk_tier)
    VALUES (v_actor, v_actor_type, 'contract_unlinked', 'client_contracts', OLD.id,
      jsonb_build_object(
        'client_id', OLD.client_id,
        'title', OLD.title,
        'file_path', OLD.file_path,
        'contract_type', OLD.contract_type,
        'signed_at', OLD.signed_at,
        'signed_by', OLD.signed_by
      ),
      'high');
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (actor_id, actor_type, action_type, target_table, target_id, old_data, new_data, risk_tier)
    VALUES (v_actor, v_actor_type, 'contract_updated', 'client_contracts', NEW.id,
      to_jsonb(OLD), to_jsonb(NEW), 'medium');
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_client_contracts ON public.client_contracts;
CREATE TRIGGER trg_audit_client_contracts
AFTER INSERT OR UPDATE OR DELETE ON public.client_contracts
FOR EACH ROW EXECUTE FUNCTION public.audit_client_contract_changes();

-- Backfill existing contracts (one-time)
INSERT INTO public.audit_log (actor_type, action_type, target_table, target_id, new_data, risk_tier, created_at)
SELECT 'system', 'contract_linked_backfill', 'client_contracts', cc.id,
  jsonb_build_object(
    'client_id', cc.client_id,
    'title', cc.title,
    'file_path', cc.file_path,
    'contract_type', cc.contract_type,
    'signed_at', cc.signed_at,
    'signed_by', cc.signed_by,
    'monthly_fee', cc.monthly_fee,
    'setup_fee', cc.setup_fee
  ),
  'low',
  cc.created_at
FROM public.client_contracts cc
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_log al
  WHERE al.target_table = 'client_contracts' AND al.target_id = cc.id
);
