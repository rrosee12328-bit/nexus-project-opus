-- Staff-only delivery ledger. No existing integrations are replayed or activated.
CREATE TABLE public.integration_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('stripe', 'fathom')),
  external_id text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 1,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, external_id)
);
ALTER TABLE public.integration_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read integration runs" ON public.integration_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'));
GRANT SELECT ON public.integration_runs TO authenticated;
GRANT ALL ON public.integration_runs TO service_role;

CREATE FUNCTION public.claim_integration_run(_provider text, _external_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE claimed uuid;
BEGIN
  INSERT INTO public.integration_runs(provider, external_id, status)
  VALUES (_provider, _external_id, 'processing')
  ON CONFLICT(provider, external_id) DO UPDATE SET
    status = 'processing', attempts = integration_runs.attempts + 1,
    updated_at = now(), last_error = NULL
  WHERE integration_runs.status = 'failed'
     OR (integration_runs.status = 'processing' AND integration_runs.updated_at < now() - interval '10 minutes')
  RETURNING id INTO claimed;
  RETURN claimed IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_integration_run(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_integration_run(text, text) TO service_role;

-- Approved summaries are deliberately separate from private call analysis.
CREATE TABLE public.client_meeting_summaries (
  id uuid PRIMARY KEY REFERENCES public.call_intelligence(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  call_date timestamptz NOT NULL,
  summary text NOT NULL CHECK (length(trim(summary)) > 0),
  approved_by uuid NOT NULL REFERENCES auth.users(id),
  approved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_meeting_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients read approved meeting summaries" ON public.client_meeting_summaries FOR SELECT TO authenticated
  USING (client_id = public.get_client_id_for_user(auth.uid()));
CREATE POLICY "Staff manage approved meeting summaries" ON public.client_meeting_summaries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_meeting_summaries TO authenticated;
GRANT ALL ON public.client_meeting_summaries TO service_role;

CREATE FUNCTION public.validate_meeting_publication() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT client_id, call_date INTO NEW.client_id, NEW.call_date FROM public.call_intelligence WHERE id = NEW.id;
  IF NEW.client_id IS NULL THEN RAISE EXCEPTION 'Link this meeting to a client before publishing'; END IF;
  NEW.approved_by := auth.uid();
  NEW.approved_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_meeting_publication BEFORE INSERT OR UPDATE ON public.client_meeting_summaries
  FOR EACH ROW EXECUTE FUNCTION public.validate_meeting_publication();

-- Restrictive guards also apply if an older permissive policy remains installed.
CREATE POLICY "Private call analysis requires staff" ON public.call_intelligence AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'));
CREATE POLICY "Private notes require staff" ON public.client_notes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'));
CREATE POLICY "Internal tasks require staff" ON public.tasks AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'));
CREATE POLICY "Hide unapproved meeting activity" ON public.client_activity_feed AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops') OR source NOT IN ('fathom', 'zoom'));

-- A paid checkout is credited atomically, including recovery after partial failure.
CREATE TABLE public.proposal_checkout_receipts (
  checkout_id text PRIMARY KEY,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.proposal_checkout_receipts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.proposal_checkout_receipts TO service_role;
CREATE FUNCTION public.record_proposal_checkout(_checkout_id text, _proposal_id uuid, _client_id uuid, _reference text, _amount numeric, _paid_at timestamptz, _monthly boolean, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.proposals; c public.clients; fee numeric; credit numeric; existing_payment boolean;
BEGIN
  SELECT * INTO p FROM public.proposals WHERE id = _proposal_id FOR UPDATE;
  SELECT * INTO c FROM public.clients WHERE id = _client_id FOR UPDATE;
  IF p.id IS NULL OR c.id IS NULL THEN RAISE EXCEPTION 'Missing proposal or client'; END IF;
  IF EXISTS(SELECT 1 FROM public.proposal_checkout_receipts WHERE checkout_id = _checkout_id) THEN RETURN; END IF;
  SELECT EXISTS(SELECT 1 FROM public.client_payments WHERE stripe_invoice_id = _reference) INTO existing_payment;
  IF _amount > 0 AND NOT existing_payment THEN
    INSERT INTO public.client_payments(client_id, amount, payment_month, payment_year, notes, stripe_invoice_id, payment_source)
    VALUES (_client_id, _amount, extract(month FROM _paid_at), extract(year FROM _paid_at), _note, _reference, 'stripe');
  END IF;
  fee := CASE WHEN p.setup_fee > 0 THEN p.setup_fee ELSE coalesce(c.setup_fee, 0) END;
  credit := greatest(coalesce(p.setup_paid, 0), coalesce(c.setup_paid, 0));
  IF NOT _monthly AND NOT existing_payment THEN credit := least(fee, credit + greatest(_amount, 0)); END IF;
  UPDATE public.clients SET setup_fee = fee, setup_paid = credit, balance_due = greatest(fee - credit, 0) WHERE id = _client_id;
  INSERT INTO public.proposal_checkout_receipts(checkout_id, proposal_id, client_id) VALUES (_checkout_id, _proposal_id, _client_id);
END;
$$;
REVOKE ALL ON FUNCTION public.record_proposal_checkout(text,uuid,uuid,text,numeric,timestamptz,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_proposal_checkout(text,uuid,uuid,text,numeric,timestamptz,boolean,text) TO service_role;
