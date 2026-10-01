-- Resolve the Dropbox shared-folder file once when a secure video token is
-- minted. Safari sends several byte-range requests for one video, so this keeps
-- the stream endpoint from re-listing the entire Dropbox folder for every range.
ALTER TABLE public.dropbox_review_video_playback_tokens
  ADD COLUMN IF NOT EXISTS folder_url text,
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS file_name text;
