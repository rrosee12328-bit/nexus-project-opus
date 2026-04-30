-- 1. Allow calendar events to be tagged to a project
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS project_id uuid;

CREATE INDEX IF NOT EXISTS idx_calendar_events_project ON public.calendar_events(project_id);

-- 2. Create the three projects under Crown And Associates
INSERT INTO public.projects (client_id, name, description, service_type, current_phase, status)
VALUES
  ('8e0f6a2f-2570-4ba7-94ec-a2a081b87fc2', 'Audare Project Intelligence', 'Project intelligence platform build for Crown And Associates', 'apps_portals_websites', 'discovery', 'in_progress'),
  ('8e0f6a2f-2570-4ba7-94ec-a2a081b87fc2', 'Construction App', 'Construction management app build for Crown And Associates', 'apps_portals_websites', 'discovery', 'in_progress'),
  ('8e0f6a2f-2570-4ba7-94ec-a2a081b87fc2', 'Bible App', 'Bible app build for Crown And Associates', 'apps_portals_websites', 'discovery', 'in_progress')
ON CONFLICT DO NOTHING;

-- 3. Fix orphaned Crown calendar event
UPDATE public.calendar_events
SET client_id = '8e0f6a2f-2570-4ba7-94ec-a2a081b87fc2'
WHERE id = '7f4cf1f7-d3aa-4e32-8f4f-64ff5c61a5f1' AND client_id IS NULL;

-- 4. Backfill project_id for existing calendar events by title keyword
UPDATE public.calendar_events ce
SET project_id = p.id
FROM public.projects p
WHERE p.client_id = '8e0f6a2f-2570-4ba7-94ec-a2a081b87fc2'
  AND p.name = 'Audare Project Intelligence'
  AND ce.client_id = '8e0f6a2f-2570-4ba7-94ec-a2a081b87fc2'
  AND ce.project_id IS NULL
  AND ce.title ILIKE '%audare%';

UPDATE public.calendar_events ce
SET project_id = p.id
FROM public.projects p
WHERE p.client_id = '8e0f6a2f-2570-4ba7-94ec-a2a081b87fc2'
  AND p.name = 'Construction App'
  AND ce.client_id = '8e0f6a2f-2570-4ba7-94ec-a2a081b87fc2'
  AND ce.project_id IS NULL
  AND ce.title ILIKE '%construction%';

UPDATE public.calendar_events ce
SET project_id = p.id
FROM public.projects p
WHERE p.client_id = '8e0f6a2f-2570-4ba7-94ec-a2a081b87fc2'
  AND p.name = 'Bible App'
  AND ce.client_id = '8e0f6a2f-2570-4ba7-94ec-a2a081b87fc2'
  AND ce.project_id IS NULL
  AND ce.title ILIKE '%bible%';