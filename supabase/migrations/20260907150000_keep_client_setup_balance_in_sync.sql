CREATE OR REPLACE FUNCTION public.sync_client_setup_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.balance_due := GREATEST(
    COALESCE(NEW.setup_fee, 0) - COALESCE(NEW.setup_paid, 0),
    0
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_client_setup_balance ON public.clients;

CREATE TRIGGER trg_sync_client_setup_balance
BEFORE INSERT OR UPDATE OF setup_fee, setup_paid ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.sync_client_setup_balance();
