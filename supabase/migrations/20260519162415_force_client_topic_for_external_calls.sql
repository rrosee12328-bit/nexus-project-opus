-- Force primary_topic = 'client' for any call linked to an external client
-- (not the internal Vektiss client and not null). Transcript-level Vektiss vs Crown
-- scoring only applies to internal calls.
UPDATE public.call_intelligence ci
SET primary_topic = 'client',
    topic_confidence = 1,
    topic_reason = LEFT('Linked meeting focus: ' || COALESCE(c.name, 'client'), 240),
    topic_scored_at = now()
FROM public.clients c
WHERE ci.client_id = c.id
  AND ci.client_id IS NOT NULL
  AND ci.client_id <> '7662c4e3-bf78-494e-b203-40a9ba06fb27'::uuid
  AND (ci.primary_topic IS DISTINCT FROM 'client');
