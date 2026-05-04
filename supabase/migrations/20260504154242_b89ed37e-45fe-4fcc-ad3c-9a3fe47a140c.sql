-- Remove the 3 newest Jeremy Ford duplicates first
DELETE FROM public.call_intelligence
WHERE id IN (
  'c0633b04-f4b5-4dd8-a849-4edd02d898c2',
  '11c99a0e-a1ed-4eeb-bab6-9f438b46f8ac',
  'c75fa84b-2f51-40a8-b9c6-73dc193de429'
);

-- Global dedupe: for any fathom_meeting_id with multiple rows, keep the oldest
DELETE FROM public.call_intelligence c
USING (
  SELECT id
  FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY fathom_meeting_id ORDER BY created_at ASC, id ASC) AS rn
    FROM public.call_intelligence
    WHERE fathom_meeting_id IS NOT NULL
  ) t
  WHERE t.rn > 1
) d
WHERE c.id = d.id;

-- Normalize any summary/transcript stored as raw JSON across the whole table
UPDATE public.call_intelligence
SET summary = COALESCE(
      (summary::jsonb)->>'markdown_formatted',
      (summary::jsonb)->>'summary',
      (summary::jsonb)->>'text',
      summary
    )
WHERE summary IS NOT NULL
  AND left(btrim(summary), 1) = '{'
  AND (summary ~ '"markdown_formatted"' OR summary ~ '"summary"' OR summary ~ '"text"');

UPDATE public.call_intelligence
SET summary_original = COALESCE(
      (summary_original::jsonb)->>'markdown_formatted',
      (summary_original::jsonb)->>'summary',
      (summary_original::jsonb)->>'text',
      summary_original
    )
WHERE summary_original IS NOT NULL
  AND left(btrim(summary_original), 1) = '{'
  AND (summary_original ~ '"markdown_formatted"' OR summary_original ~ '"summary"' OR summary_original ~ '"text"');

-- Convert JSON-array transcripts into "[ts] Speaker: text" lines
UPDATE public.call_intelligence ci
SET transcript = sub.txt
FROM (
  SELECT id, string_agg(
    '[' || COALESCE(elem->>'timestamp','') || '] ' ||
    COALESCE(elem->'speaker'->>'display_name', elem->>'speaker', '') || ': ' ||
    COALESCE(elem->>'text',''),
    E'\n' ORDER BY ord
  ) AS txt
  FROM (
    SELECT id, transcript::jsonb AS j
    FROM public.call_intelligence
    WHERE transcript IS NOT NULL
      AND left(btrim(transcript), 1) = '['
      AND transcript ~ '"timestamp"'
  ) src,
  LATERAL jsonb_array_elements(src.j) WITH ORDINALITY AS arr(elem, ord)
  GROUP BY id
) sub
WHERE ci.id = sub.id;

-- Prevent future duplicates per Fathom meeting
CREATE UNIQUE INDEX IF NOT EXISTS call_intelligence_fathom_meeting_id_unique
  ON public.call_intelligence (fathom_meeting_id)
  WHERE fathom_meeting_id IS NOT NULL;
