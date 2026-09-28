ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS review_url text;

ALTER TABLE public.approval_requests
  DROP CONSTRAINT IF EXISTS approval_requests_review_url_https;

ALTER TABLE public.approval_requests
  ADD CONSTRAINT approval_requests_review_url_https
  CHECK (review_url IS NULL OR review_url ~ '^https://');

-- Clients may respond to an approval, but cannot replace the deliverable link.
CREATE OR REPLACE FUNCTION public.enforce_approval_response_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') AND NOT has_role(auth.uid(), 'ops') THEN
    NEW.title := OLD.title;
    NEW.description := OLD.description;
    NEW.review_url := OLD.review_url;
    NEW.phase := OLD.phase;
    NEW.project_id := OLD.project_id;
    NEW.client_id := OLD.client_id;
    NEW.submitted_by := OLD.submitted_by;
    NEW.created_at := OLD.created_at;
    NEW.id := OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
