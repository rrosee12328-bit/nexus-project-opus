-- Company-wide Dropbox OAuth connection used only by secure Edge Functions to
-- enumerate video filenames from shared folders. Tokens are never exposed to
-- browser clients or ordinary authenticated database queries.
CREATE TABLE IF NOT EXISTS public.dropbox_video_review_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL UNIQUE,
  account_name text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  access_token_expires_at timestamptz,
  connected_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.dropbox_video_review_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_to text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dropbox_video_review_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropbox_video_review_oauth_states ENABLE ROW LEVEL SECURITY;

-- The service role used by the OAuth and import Edge Functions bypasses RLS.
-- Do not grant browser roles direct access to credentials or transient states.
REVOKE ALL ON public.dropbox_video_review_connections FROM anon, authenticated;
REVOKE ALL ON public.dropbox_video_review_oauth_states FROM anon, authenticated;
GRANT ALL ON public.dropbox_video_review_connections TO service_role;
GRANT ALL ON public.dropbox_video_review_oauth_states TO service_role;

DROP TRIGGER IF EXISTS update_dropbox_video_review_connections_updated_at
  ON public.dropbox_video_review_connections;
CREATE TRIGGER update_dropbox_video_review_connections_updated_at
  BEFORE UPDATE ON public.dropbox_video_review_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- This is the only browser-readable view of the connection. It intentionally
-- omits every credential and can be used by both admins and ops staff.
CREATE OR REPLACE FUNCTION public.get_dropbox_video_review_connection()
RETURNS TABLE (
  connected boolean,
  account_name text,
  connected_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin')
    AND NOT public.has_role(auth.uid(), 'ops') THEN
    RAISE EXCEPTION 'Only staff can view Dropbox import connection status';
  END IF;

  RETURN QUERY
  SELECT true, connection.account_name, connection.connected_at, connection.updated_at
  FROM public.dropbox_video_review_connections AS connection
  WHERE connection.is_active = true
  ORDER BY connection.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::timestamptz, NULL::timestamptz;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dropbox_video_review_connection() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dropbox_video_review_connection() TO authenticated;
