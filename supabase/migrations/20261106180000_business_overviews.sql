-- Standalone sales documents. No client, billing, signature or email side effects.
create table public.business_overviews (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (length(trim(company_name)) between 1 and 200),
  recipient_email text not null check (length(recipient_email) <= 254 and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  title text not null check (length(trim(title)) between 1 and 200),
  content text not null check (length(trim(content)) between 1 and 40000),
  share_token text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  published boolean not null default false,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now()
);
alter table public.business_overviews enable row level security;
revoke all on public.business_overviews from anon, authenticated;
grant select, insert, update on public.business_overviews to authenticated;
create policy business_overviews_admin on public.business_overviews
  for all to authenticated using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Explicit public projection: recipient addresses and internal IDs never leave this RPC.
create function public.read_business_overview(p_token text)
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('company_name', company_name, 'title', title,
    'content', content, 'expires_at', expires_at)
  from public.business_overviews
  where share_token = p_token and length(p_token) = 64
    and published and expires_at > now();
$$;
revoke all on function public.read_business_overview(text) from public;
grant execute on function public.read_business_overview(text) to anon, authenticated;
