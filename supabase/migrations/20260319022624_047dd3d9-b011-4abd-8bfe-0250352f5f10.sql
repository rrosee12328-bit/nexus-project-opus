
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage messages"
  ON public.messages FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Clients can view messages for their own client record
CREATE POLICY "Clients can view their own messages"
  ON public.messages FOR SELECT
  USING (client_id = get_client_id_for_user(auth.uid()));

-- Clients can insert messages for their own client record
CREATE POLICY "Clients can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (client_id = get_client_id_for_user(auth.uid()) AND sender_id = auth.uid());

-- Clients can update read_at on their own messages
CREATE POLICY "Clients can mark messages read"
  ON public.messages FOR UPDATE
  USING (client_id = get_client_id_for_user(auth.uid()));

-- Ops can view messages
CREATE POLICY "Ops can view messages"
  ON public.messages FOR SELECT
  USING (has_role(auth.uid(), 'ops'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
