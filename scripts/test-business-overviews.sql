-- Run after the migration inside BEGIN / ROLLBACK. Synthetic records only.
insert into public.business_overviews (company_name, recipient_email, title, content, share_token, published)
values ('Synthetic overview', 'test@example.invalid', 'Discovery', 'Approved business content', repeat('a',64), true),
       ('Synthetic draft', 'test@example.invalid', 'Draft', 'Not public', repeat('b',64), false);
insert into public.business_overviews (company_name, recipient_email, title, content, share_token, published, expires_at)
values ('Synthetic expired', 'test@example.invalid', 'Expired', 'Not public', repeat('c',64), true, now()-interval '1 day');
set local role anon;
do $$
declare result jsonb;
begin
  result := public.read_business_overview(repeat('a',64));
  if result->>'title' is distinct from 'Discovery' then raise exception 'Published lookup failed'; end if;
  if result ? 'recipient_email' or result ? 'id' or result ? 'share_token' then raise exception 'Private field leak'; end if;
  if public.read_business_overview(repeat('b',64)) is not null then raise exception 'Draft exposed'; end if;
  if public.read_business_overview(repeat('c',64)) is not null then raise exception 'Expired exposed'; end if;
  if public.read_business_overview('invalid') is not null then raise exception 'Invalid token accepted'; end if;
  begin
    perform 1 from public.business_overviews;
    raise exception 'Anonymous table access allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  if exists(select 1 from public.business_overviews) then raise exception 'Nonadmin can list overviews'; end if;
  begin
    insert into public.business_overviews(company_name,recipient_email,title,content) values('Forbidden','test@example.invalid','Denied','Denied');
    raise exception 'Nonadmin write allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
update public.business_overviews set published=false where share_token=repeat('a',64);
set local role anon;
do $$ begin
  if public.read_business_overview(repeat('a',64)) is not null then raise exception 'Revoked exposed'; end if;
end $$;
reset role;
select 'Business overview security checks passed' as result;
