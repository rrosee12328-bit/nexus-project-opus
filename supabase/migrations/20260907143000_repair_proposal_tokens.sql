UPDATE public.proposals
SET token = encode(gen_random_bytes(32), 'hex')
WHERE token IS NULL OR token = '';

ALTER TABLE public.proposals
  ALTER COLUMN token SET DEFAULT encode(gen_random_bytes(32), 'hex'),
  ALTER COLUMN token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS proposals_token_key
  ON public.proposals (token);
