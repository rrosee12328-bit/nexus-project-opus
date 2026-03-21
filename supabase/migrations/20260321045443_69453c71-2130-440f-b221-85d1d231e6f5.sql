
-- Update Goodland Church project to reflect content production
UPDATE public.projects
SET name = 'Goodland Church Content',
    description = '2 short-form videos per week (Thursday invite + Saturday creative). On-site shoots 2 Sundays/month, 9 AM – 12:30 PM.'
WHERE id = '16bf00d5-8bde-4b07-9661-60d735e42628';

-- Remove the incorrect auto-generated tasks
DELETE FROM public.tasks WHERE id IN (
  '0f35380c-c82e-496c-b23d-b169f4ae7292',
  '511ad6a3-f5a6-4678-b3ce-1ca70a4888d3'
);
