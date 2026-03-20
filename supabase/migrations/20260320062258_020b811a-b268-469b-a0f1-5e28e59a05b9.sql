
-- Allow ops and client users to manage their own AI conversations
CREATE POLICY "Ops can manage their own conversations"
ON public.ai_conversations
FOR ALL
TO authenticated
USING (user_id = auth.uid() AND has_role(auth.uid(), 'ops'::app_role))
WITH CHECK (user_id = auth.uid() AND has_role(auth.uid(), 'ops'::app_role));

CREATE POLICY "Clients can manage their own conversations"
ON public.ai_conversations
FOR ALL
TO authenticated
USING (user_id = auth.uid() AND has_role(auth.uid(), 'client'::app_role))
WITH CHECK (user_id = auth.uid() AND has_role(auth.uid(), 'client'::app_role));
