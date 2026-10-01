-- Ops needs a narrow, controlled way to create the first client project from
-- Video Reviews. Direct project management remains admin-only.
CREATE OR REPLACE FUNCTION public.create_video_review_project(
  _client_id uuid,
  _project_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _project_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'ops') THEN
    RAISE EXCEPTION 'Only staff can create a project for video review';
  END IF;

  IF NULLIF(trim(COALESCE(_project_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A project name is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = _client_id) THEN
    RAISE EXCEPTION 'Choose an existing client';
  END IF;

  INSERT INTO public.projects (
    client_id,
    name,
    description,
    service_type,
    status,
    current_phase,
    progress
  ) VALUES (
    _client_id,
    trim(_project_name),
    'Created from the Video Reviews workspace.',
    'video_review',
    'in_progress',
    'review',
    0
  )
  RETURNING id INTO _project_id;

  INSERT INTO public.project_phases (project_id, phase, sort_order, status, started_at)
  VALUES
    (_project_id, 'discovery', 0, 'not_started', NULL),
    (_project_id, 'design', 1, 'not_started', NULL),
    (_project_id, 'development', 2, 'not_started', NULL),
    (_project_id, 'review', 3, 'in_progress', now()),
    (_project_id, 'launch', 4, 'not_started', NULL),
    (_project_id, 'deploy', 5, 'not_started', NULL);

  RETURN _project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_video_review_project(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_video_review_project(uuid, text) TO authenticated;
