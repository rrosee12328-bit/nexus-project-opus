-- Sequences for auto-numbering
CREATE SEQUENCE IF NOT EXISTS public.client_number_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS public.project_number_seq START 1000;

-- Clients: add unique editable client_number (e.g., CL-1000)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_number text;

-- Backfill existing clients with sequential numbers ordered by created_at
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.clients WHERE client_number IS NULL ORDER BY created_at LOOP
    UPDATE public.clients SET client_number = 'CL-' || nextval('public.client_number_seq')::text WHERE id = r.id;
  END LOOP;
END $$;

-- Default for new rows
ALTER TABLE public.clients
  ALTER COLUMN client_number SET DEFAULT ('CL-' || nextval('public.client_number_seq')::text);

CREATE UNIQUE INDEX IF NOT EXISTS clients_client_number_key ON public.clients(client_number);

-- Projects: add project_number (name already exists)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_number text;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.projects WHERE project_number IS NULL ORDER BY created_at LOOP
    UPDATE public.projects SET project_number = 'PR-' || nextval('public.project_number_seq')::text WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.projects
  ALTER COLUMN project_number SET DEFAULT ('PR-' || nextval('public.project_number_seq')::text);

CREATE UNIQUE INDEX IF NOT EXISTS projects_project_number_key ON public.projects(project_number);

-- Proposals: add project_name and project_number for inclusion on generated contracts
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS project_number text;
