-- The client receives only a short-lived opaque token for the embedded video
-- stream. Dropbox credentials and user sessions never appear in a video URL.
CREATE TABLE IF NOT EXISTS public.dropbox_review_video_playback_tokens (
  token uuid PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES public.approval_request_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dropbox_review_video_playback_tokens_expiry
  ON public.dropbox_review_video_playback_tokens(expires_at);

ALTER TABLE public.dropbox_review_video_playback_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dropbox_review_video_playback_tokens FROM anon, authenticated;
