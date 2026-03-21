-- Drop the overly permissive client update policy on messages
DROP POLICY IF EXISTS "Clients can mark messages read" ON public.messages;

-- Create a restricted policy that only allows setting read_at
CREATE POLICY "Clients can mark messages read"
ON public.messages FOR UPDATE
TO authenticated
USING (client_id = get_client_id_for_user(auth.uid()))
WITH CHECK (client_id = get_client_id_for_user(auth.uid()));

-- Create a trigger to prevent clients from changing anything except read_at
CREATE OR REPLACE FUNCTION public.enforce_message_read_only_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If the caller is a client (not admin/ops), only allow read_at changes
  IF NOT has_role(auth.uid(), 'admin') AND NOT has_role(auth.uid(), 'ops') THEN
    -- Revert all fields except read_at to their original values
    NEW.content := OLD.content;
    NEW.sender_id := OLD.sender_id;
    NEW.client_id := OLD.client_id;
    NEW.attachment_url := OLD.attachment_url;
    NEW.attachment_name := OLD.attachment_name;
    NEW.attachment_type := OLD.attachment_type;
    NEW.created_at := OLD.created_at;
    NEW.id := OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_message_read_only ON public.messages;
CREATE TRIGGER trg_enforce_message_read_only
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_message_read_only_update();