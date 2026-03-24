
-- Create function to auto-archive tasks done for 7+ days
CREATE OR REPLACE FUNCTION public.archive_done_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.tasks
  SET archived_at = now()
  WHERE status = 'done'
    AND archived_at IS NULL
    AND updated_at < now() - interval '7 days';
END;
$$;
