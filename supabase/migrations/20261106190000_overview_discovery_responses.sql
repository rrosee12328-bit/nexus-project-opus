alter table public.business_overviews
  add column discovery_answers jsonb,
  add column discovery_submitted_at timestamptz;

-- Bearer link permits one submission, never reading another visitor's answers.
-- Row locking makes concurrent clicks/retries safe. No email or billing side effects.
create function public.submit_overview_discovery(p_token text, p_answers jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare doc public.business_overviews%rowtype;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Overview unavailable'; end if;
  select * into doc from public.business_overviews where share_token=p_token for update;
  if not found or not doc.published or doc.expires_at <= now() then raise exception 'Overview unavailable'; end if;
  if doc.discovery_submitted_at is not null then return 'already_submitted'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then raise exception 'Answers must be a list'; end if;
  if jsonb_array_length(p_answers) <> 18 then raise exception 'Please answer all 18 questions'; end if;
  if exists(select 1 from jsonb_array_elements(p_answers) a where jsonb_typeof(a) <> 'string'
    or length(trim(a #>> '{}')) not between 1 and 3000) then raise exception 'Each answer must contain 1 to 3000 characters'; end if;
  update public.business_overviews set discovery_answers=p_answers, discovery_submitted_at=now() where id=doc.id;
  return 'submitted';
end $$;
revoke all on function public.submit_overview_discovery(text,jsonb) from public;
grant execute on function public.submit_overview_discovery(text,jsonb) to anon, authenticated;
