
-- Test: advance review phase of Goodland Church to in_progress
UPDATE public.project_phases
SET status = 'in_progress', started_at = now()
WHERE id = '15fde395-9604-4582-bd37-2182b456554e'
  AND status = 'not_started';
