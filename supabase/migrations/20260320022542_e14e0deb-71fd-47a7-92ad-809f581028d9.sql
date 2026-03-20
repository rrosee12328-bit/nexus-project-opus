
-- Allow admins to read email_send_log
CREATE POLICY "Admins can view email send log"
  ON public.email_send_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));
