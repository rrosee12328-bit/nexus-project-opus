
-- Add user_id to clients table to link auth users to client records
ALTER TABLE public.clients ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL UNIQUE;

-- Security definer function to get client_id for a user
CREATE OR REPLACE FUNCTION public.get_client_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.clients WHERE user_id = _user_id LIMIT 1
$$;

-- Drop old permissive client project policies
DROP POLICY IF EXISTS "Clients can view their projects" ON public.projects;
DROP POLICY IF EXISTS "Clients can view their project phases" ON public.project_phases;

-- New scoped policies: clients only see projects belonging to their client record
CREATE POLICY "Clients can view their own projects" ON public.projects
  FOR SELECT USING (
    client_id = public.get_client_id_for_user(auth.uid())
  );

CREATE POLICY "Clients can view their own project phases" ON public.project_phases
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM public.projects WHERE client_id = public.get_client_id_for_user(auth.uid())
    )
  );
