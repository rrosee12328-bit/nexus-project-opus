ALTER TABLE public.messages
  ADD COLUMN attachment_url text,
  ADD COLUMN attachment_name text,
  ADD COLUMN attachment_type text;