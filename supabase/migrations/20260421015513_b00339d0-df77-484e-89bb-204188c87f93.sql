ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS proposal_type text NOT NULL DEFAULT 'retainer',
  ADD COLUMN IF NOT EXISTS hourly_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scope_description text,
  ADD COLUMN IF NOT EXISTS deliverables text,
  ADD COLUMN IF NOT EXISTS timeline text;

ALTER TABLE public.proposals
  DROP CONSTRAINT IF EXISTS proposals_proposal_type_check;

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_proposal_type_check
  CHECK (proposal_type IN ('hourly', 'project', 'retainer'));