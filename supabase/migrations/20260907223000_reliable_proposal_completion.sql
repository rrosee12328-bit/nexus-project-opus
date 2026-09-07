ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS nda_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS nda_signed_name text;

-- Existing completed proposal flows required the NDA before the contract, so the
-- contract signature is the best available audit record for historical rows.
UPDATE public.proposals
SET nda_signed_at = signed_at,
    nda_signed_name = signed_name
WHERE signed_at IS NOT NULL
  AND nda_signed_at IS NULL;

CREATE OR REPLACE FUNCTION public.convert_proposal_to_client(p_proposal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_client_id uuid;
BEGIN
  SELECT *
  INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal % not found', p_proposal_id;
  END IF;

  v_client_id := COALESCE(v_proposal.converted_to_client_id, v_proposal.client_id);

  IF v_client_id IS NOT NULL THEN
    UPDATE public.clients
    SET name = COALESCE(NULLIF(v_proposal.client_name, ''), name),
        email = COALESCE(NULLIF(v_proposal.client_email, ''), email),
        status = CASE WHEN status IN ('active', 'onboarding') THEN status ELSE 'onboarding' END,
        pipeline_stage = 'won',
        proposal_id = COALESCE(proposal_id, p_proposal_id),
        setup_fee = CASE WHEN v_proposal.setup_fee > 0 THEN v_proposal.setup_fee ELSE setup_fee END,
        monthly_fee = CASE WHEN v_proposal.monthly_fee > 0 THEN v_proposal.monthly_fee ELSE monthly_fee END,
        updated_at = now()
    WHERE id = v_client_id;

    IF NOT FOUND THEN
      v_client_id := NULL;
    END IF;
  END IF;

  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (
      name,
      email,
      proposal_id,
      status,
      pipeline_stage,
      setup_fee,
      monthly_fee,
      created_by
    ) VALUES (
      COALESCE(NULLIF(v_proposal.client_name, ''), NULLIF(v_proposal.project_name, ''), 'Unknown'),
      v_proposal.client_email,
      p_proposal_id,
      'onboarding',
      'won',
      v_proposal.setup_fee,
      v_proposal.monthly_fee,
      v_proposal.created_by
    )
    RETURNING id INTO v_client_id;
  END IF;

  UPDATE public.proposals
  SET client_id = v_client_id,
      converted_to_client_id = v_client_id,
      updated_at = now()
  WHERE id = p_proposal_id;

  RETURN v_client_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.convert_proposal_to_client(uuid) FROM authenticated, anon, PUBLIC;
