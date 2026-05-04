-- Tasks: AI generation + review flagging + source call link
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS ai_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_call_id uuid REFERENCES public.call_intelligence(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tasks_needs_review ON public.tasks(needs_review) WHERE needs_review = true;
CREATE INDEX IF NOT EXISTS idx_tasks_source_call ON public.tasks(source_call_id);

-- Clients: aspirations + sentiment + last call summary snapshot
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS aspirations text,
  ADD COLUMN IF NOT EXISTS aspirations_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_sentiment text,
  ADD COLUMN IF NOT EXISTS last_call_headline text,
  ADD COLUMN IF NOT EXISTS last_call_id uuid REFERENCES public.call_intelligence(id) ON DELETE SET NULL;

-- Enable realtime broadcast (safe if already added)
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.clients; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.client_notes; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.call_intelligence; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.approval_requests; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.clients REPLICA IDENTITY FULL;
ALTER TABLE public.client_notes REPLICA IDENTITY FULL;
ALTER TABLE public.call_intelligence REPLICA IDENTITY FULL;