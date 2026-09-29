-- Tie portal activation and proposals to an explicit client project.
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS portal_primary_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS portal_access_status text NOT NULL DEFAULT 'not_invited',
  ADD COLUMN IF NOT EXISTS portal_invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_activated_at timestamptz;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_portal_access_status_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_portal_access_status_check
  CHECK (portal_access_status IN ('not_invited', 'invited', 'active', 'disabled'));

CREATE INDEX IF NOT EXISTS idx_proposals_project_id
  ON public.proposals(project_id);

CREATE INDEX IF NOT EXISTS idx_clients_portal_primary_project_id
  ON public.clients(portal_primary_project_id);

COMMENT ON COLUMN public.clients.portal_primary_project_id IS
  'Project highlighted when the client first activates or enters the portal.';

COMMENT ON COLUMN public.clients.portal_access_status IS
  'Administrative lifecycle for controlled, invitation-only portal access.';

-- Create the workspace project from a paid proposal exactly once, even when
-- Stripe retries or delivers concurrent completion events.
CREATE OR REPLACE FUNCTION public.ensure_proposal_project(
  _proposal_id uuid,
  _client_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _proposal public.proposals%ROWTYPE;
  _project_id uuid;
BEGIN
  SELECT * INTO _proposal
  FROM public.proposals
  WHERE id = _proposal_id
  FOR UPDATE;

  IF NOT FOUND OR _proposal.client_id IS DISTINCT FROM _client_id THEN
    RAISE EXCEPTION 'Proposal does not belong to this client';
  END IF;

  IF _proposal.project_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = _proposal.project_id AND client_id = _client_id
    ) THEN
      RAISE EXCEPTION 'Proposal project does not belong to this client';
    END IF;
    RETURN _proposal.project_id;
  END IF;

  IF NULLIF(trim(_proposal.project_name), '') IS NULL THEN
    RAISE EXCEPTION 'Paid proposal is missing a project name';
  END IF;

  INSERT INTO public.projects (
    client_id, name, description, status, current_phase, progress, start_date
  ) VALUES (
    _client_id,
    trim(_proposal.project_name),
    COALESCE(_proposal.scope_description, _proposal.services_description, 'Project created from an approved Vektiss proposal.'),
    'in_progress', 'discovery', 0, CURRENT_DATE
  ) RETURNING id INTO _project_id;

  INSERT INTO public.project_phases (project_id, phase, sort_order, status, started_at)
  VALUES
    (_project_id, 'discovery', 0, 'in_progress', now()),
    (_project_id, 'design', 1, 'not_started', NULL),
    (_project_id, 'development', 2, 'not_started', NULL),
    (_project_id, 'review', 3, 'not_started', NULL),
    (_project_id, 'launch', 4, 'not_started', NULL);

  UPDATE public.proposals SET project_id = _project_id WHERE id = _proposal_id;
  RETURN _project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_proposal_project(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_proposal_project(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.activate_my_client_portal()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _client_id uuid;
BEGIN
  UPDATE public.clients
  SET portal_access_status = 'active',
      portal_activated_at = COALESCE(portal_activated_at, now())
  WHERE user_id = auth.uid()
  RETURNING id INTO _client_id;
  RETURN _client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_my_client_portal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_my_client_portal() TO authenticated;
