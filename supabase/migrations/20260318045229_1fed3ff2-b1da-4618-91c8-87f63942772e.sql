CREATE POLICY "Clients can view their own payments"
ON public.client_payments
FOR SELECT
TO authenticated
USING (client_id = get_client_id_for_user(auth.uid()));