UPDATE public.calendar_events
SET event_type = 'outlook',
    updated_at = now()
WHERE outlook_user_id IS NOT NULL
  AND outlook_event_id IS NOT NULL
  AND event_type <> 'outlook';