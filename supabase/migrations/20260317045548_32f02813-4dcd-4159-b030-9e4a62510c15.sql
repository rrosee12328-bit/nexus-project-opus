
-- Project status enum
CREATE TYPE public.project_status AS ENUM ('not_started', 'in_progress', 'completed', 'on_hold');

-- Project phase enum (standard web phases)
CREATE TYPE public.project_phase AS ENUM ('discovery', 'design', 'development', 'review', 'launch');

-- Projects table
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status project_status NOT NULL DEFAULT 'not_started',
  current_phase project_phase NOT NULL DEFAULT 'discovery',
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  start_date date,
  target_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Project phases detail table for tracking each phase's status
CREATE TABLE public.project_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase project_phase NOT NULL,
  status project_status NOT NULL DEFAULT 'not_started',
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0
);

-- Unique constraint: one entry per phase per project
ALTER TABLE public.project_phases ADD CONSTRAINT unique_project_phase UNIQUE (project_id, phase);

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_phases ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins can manage projects" ON public.projects FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage project phases" ON public.project_phases FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Ops can view
CREATE POLICY "Ops can view projects" ON public.projects FOR SELECT
  USING (has_role(auth.uid(), 'ops'::app_role));
CREATE POLICY "Ops can view project phases" ON public.project_phases FOR SELECT
  USING (has_role(auth.uid(), 'ops'::app_role));

-- Clients can view their own projects (via client_user linking - for now allow all authenticated to view)
-- We'll need a client_users table to link auth users to clients later
CREATE POLICY "Clients can view their projects" ON public.projects FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Clients can view their project phases" ON public.project_phases FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Updated_at trigger for projects
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
