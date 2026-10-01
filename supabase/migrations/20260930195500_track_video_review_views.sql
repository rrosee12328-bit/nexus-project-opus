-- Opening a named video is deliberately separate from approving it. A grouped
-- review has one client, so the timestamp records that client's first open.
ALTER TABLE public.approval_request_items
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_approval_request_items_viewed_at
  ON public.approval_request_items(approval_request_id, viewed_at)
  WHERE viewed_at IS NOT NULL;

-- Clients may set the initial viewed timestamp while a video is still pending.
-- All other item data remains immutable, and the database supplies the actual
-- timestamp instead of trusting a browser-provided value.
CREATE OR REPLACE FUNCTION public.enforce_approval_request_item_response_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'approved', 'rejected', 'suggestions') THEN
    RAISE EXCEPTION 'Unsupported approval item status';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'ops') THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'This video has already received a response';
    END IF;

    -- A first open is not a decision. Reset every mutable business field so a
    -- client cannot use this update to alter an item while marking it viewed.
    IF NEW.status = 'pending' AND OLD.viewed_at IS NULL AND NEW.viewed_at IS NOT NULL THEN
      NEW.id := OLD.id;
      NEW.approval_request_id := OLD.approval_request_id;
      NEW.title := OLD.title;
      NEW.review_url := OLD.review_url;
      NEW.position := OLD.position;
      NEW.status := OLD.status;
      NEW.response_note := OLD.response_note;
      NEW.responded_at := OLD.responded_at;
      NEW.created_at := OLD.created_at;
      NEW.updated_at := OLD.updated_at;
      NEW.viewed_at := now();
      RETURN NEW;
    END IF;

    IF NEW.status NOT IN ('approved', 'rejected', 'suggestions') THEN
      RAISE EXCEPTION 'Choose approve, decline, or suggestions';
    END IF;

    IF NEW.status IN ('rejected', 'suggestions')
      AND NULLIF(trim(COALESCE(NEW.response_note, '')), '') IS NULL THEN
      RAISE EXCEPTION 'A response note is required for declines and suggestions';
    END IF;

    NEW.id := OLD.id;
    NEW.approval_request_id := OLD.approval_request_id;
    NEW.title := OLD.title;
    NEW.review_url := OLD.review_url;
    NEW.position := OLD.position;
    NEW.created_at := OLD.created_at;
    NEW.viewed_at := OLD.viewed_at;
    NEW.responded_at := now();
  END IF;
  RETURN NEW;
END;
$$;
