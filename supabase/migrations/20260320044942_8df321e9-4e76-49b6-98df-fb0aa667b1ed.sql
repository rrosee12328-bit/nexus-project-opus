
CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New conversation',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage their own conversations"
  ON public.ai_conversations FOR ALL
  TO authenticated
  USING (user_id = auth.uid() AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_id = auth.uid() AND has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_ai_conversations_updated_at
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
