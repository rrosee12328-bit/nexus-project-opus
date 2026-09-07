-- Normalize client-facing changes from portal actions and external integrations.
CREATE TABLE IF NOT EXISTS public.client_activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  source text NOT NULL,
  event_type text NOT NULL,
  source_record_id text NOT NULL,
  title text NOT NULL,
  summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, event_type, source_record_id)
);

CREATE INDEX IF NOT EXISTS client_activity_feed_client_date_idx
  ON public.client_activity_feed (client_id, occurred_at DESC);

ALTER TABLE public.client_activity_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients read own activity"
  ON public.client_activity_feed FOR SELECT TO authenticated
  USING (client_id = public.get_client_id_for_user(auth.uid()));

CREATE POLICY "Staff manage client activity"
  ON public.client_activity_feed FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ops'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ops'::app_role));

CREATE POLICY "Service role manages client activity"
  ON public.client_activity_feed FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.upsert_client_activity(
  _client_id uuid,
  _source text,
  _event_type text,
  _source_record_id text,
  _title text,
  _summary text,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _occurred_at timestamptz DEFAULT now()
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _client_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.client_activity_feed (client_id, source, event_type, source_record_id, title, summary, metadata, occurred_at)
  VALUES (_client_id, _source, _event_type, _source_record_id, _title, _summary, COALESCE(_metadata, '{}'::jsonb), COALESCE(_occurred_at, now()))
  ON CONFLICT (source, event_type, source_record_id) DO UPDATE SET
    client_id = EXCLUDED.client_id,
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    metadata = EXCLUDED.metadata,
    occurred_at = EXCLUDED.occurred_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_client_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _source text;
BEGIN
  IF TG_TABLE_NAME = 'client_payments' THEN
    IF NEW.notes IS DISTINCT FROM 'Projected' THEN
      _source := CASE WHEN NEW.payment_source = 'stripe' THEN 'stripe' ELSE 'payment' END;
      PERFORM public.upsert_client_activity(NEW.client_id, _source, 'payment_received', NEW.id::text,
        'Payment received', format('$%s payment recorded', trim(to_char(NEW.amount, 'FM999,999,990.00'))),
        jsonb_build_object('amount', NEW.amount, 'payment_source', NEW.payment_source), NEW.created_at);
    END IF;
  ELSIF TG_TABLE_NAME = 'stripe_invoices' THEN
    PERFORM public.upsert_client_activity(NEW.client_id, 'stripe', 'invoice_status', NEW.id::text,
      CASE WHEN NEW.status = 'paid' THEN 'Invoice paid' WHEN NEW.status = 'open' THEN 'Invoice ready' ELSE 'Billing updated' END,
      format('Invoice %s is %s', COALESCE(NEW.stripe_invoice_number, ''), NEW.status),
      jsonb_build_object('status', NEW.status, 'amount_due', NEW.amount_due, 'amount_paid', NEW.amount_paid), NEW.updated_at);
  ELSIF TG_TABLE_NAME = 'call_intelligence' THEN
    PERFORM public.upsert_client_activity(NEW.client_id,
      CASE WHEN NEW.fathom_meeting_id IS NOT NULL THEN 'fathom' ELSE 'zoom' END,
      'meeting_summary', NEW.id::text, 'Meeting notes are ready',
      left(COALESCE(NEW.summary, 'A new meeting was added to your workspace.'), 360),
      jsonb_build_object('call_type', NEW.call_type, 'project_id', NEW.project_id), NEW.call_date);
  ELSIF TG_TABLE_NAME = 'projects' THEN
    PERFORM public.upsert_client_activity(NEW.client_id, 'project', 'project_status', NEW.id::text,
      NEW.name || ' was updated', format('Current phase: %s. Progress: %s%%.', replace(NEW.current_phase::text, '_', ' '), NEW.progress),
      jsonb_build_object('status', NEW.status, 'phase', NEW.current_phase, 'progress', NEW.progress), NEW.updated_at);
  ELSIF TG_TABLE_NAME = 'approval_requests' THEN
    PERFORM public.upsert_client_activity(NEW.client_id, 'approval', 'approval_status', NEW.id::text,
      CASE WHEN NEW.status = 'pending' THEN 'Approval requested' ELSE 'Approval ' || NEW.status END,
      NEW.title, jsonb_build_object('status', NEW.status, 'project_id', NEW.project_id), NEW.updated_at);
  ELSIF TG_TABLE_NAME = 'proposals' AND NEW.client_id IS NOT NULL THEN
    IF NEW.signed_at IS NOT NULL THEN
      PERFORM public.upsert_client_activity(NEW.client_id, 'proposal', 'agreement_signed', NEW.id::text,
        'Agreement signed', COALESCE(NEW.project_name, NEW.services_description, 'Your Vektiss agreement') || ' is signed.',
        jsonb_build_object('nda_signed_at', NEW.nda_signed_at, 'paid_at', NEW.paid_at), NEW.signed_at);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_client_payment_activity ON public.client_payments;
CREATE TRIGGER capture_client_payment_activity AFTER INSERT OR UPDATE ON public.client_payments FOR EACH ROW EXECUTE FUNCTION public.capture_client_activity();
DROP TRIGGER IF EXISTS capture_stripe_invoice_activity ON public.stripe_invoices;
CREATE TRIGGER capture_stripe_invoice_activity AFTER INSERT OR UPDATE ON public.stripe_invoices FOR EACH ROW EXECUTE FUNCTION public.capture_client_activity();
DROP TRIGGER IF EXISTS capture_call_activity ON public.call_intelligence;
CREATE TRIGGER capture_call_activity AFTER INSERT OR UPDATE OF summary, key_decisions, client_id ON public.call_intelligence FOR EACH ROW EXECUTE FUNCTION public.capture_client_activity();
DROP TRIGGER IF EXISTS capture_project_activity ON public.projects;
CREATE TRIGGER capture_project_activity AFTER INSERT OR UPDATE OF status, current_phase, progress ON public.projects FOR EACH ROW EXECUTE FUNCTION public.capture_client_activity();
DROP TRIGGER IF EXISTS capture_approval_activity ON public.approval_requests;
CREATE TRIGGER capture_approval_activity AFTER INSERT OR UPDATE OF status ON public.approval_requests FOR EACH ROW EXECUTE FUNCTION public.capture_client_activity();
DROP TRIGGER IF EXISTS capture_proposal_activity ON public.proposals;
CREATE TRIGGER capture_proposal_activity AFTER INSERT OR UPDATE OF signed_at, nda_signed_at, paid_at ON public.proposals FOR EACH ROW EXECUTE FUNCTION public.capture_client_activity();

INSERT INTO public.client_activity_feed (client_id, source, event_type, source_record_id, title, summary, metadata, occurred_at)
SELECT client_id, 'project', 'project_status', id::text, name || ' was updated',
  format('Current phase: %s. Progress: %s%%.', replace(current_phase::text, '_', ' '), progress),
  jsonb_build_object('status', status, 'phase', current_phase, 'progress', progress), updated_at
FROM public.projects
ON CONFLICT (source, event_type, source_record_id) DO NOTHING;

INSERT INTO public.client_activity_feed (client_id, source, event_type, source_record_id, title, summary, metadata, occurred_at)
SELECT client_id, CASE WHEN fathom_meeting_id IS NOT NULL THEN 'fathom' ELSE 'zoom' END, 'meeting_summary', id::text,
  'Meeting notes are ready', left(COALESCE(summary, 'A meeting was added to your workspace.'), 360),
  jsonb_build_object('call_type', call_type, 'project_id', project_id), call_date
FROM public.call_intelligence WHERE client_id IS NOT NULL
ON CONFLICT (source, event_type, source_record_id) DO NOTHING;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.client_activity_feed;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
