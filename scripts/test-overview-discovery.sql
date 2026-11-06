update public.business_overviews set published=true where share_token=repeat('a',64);
set local role anon;
do $$
declare answers jsonb := to_jsonb(array_fill('Synthetic business answer'::text,array[18]));
begin
  begin
    perform public.submit_overview_discovery(repeat('a',64),'[]'::jsonb);
    raise exception 'Invalid answer list accepted';
  exception when raise_exception then
    if sqlerrm = 'Invalid answer list accepted' then raise; end if;
  end;
  if public.submit_overview_discovery(repeat('a',64),answers) <> 'submitted' then raise exception 'Submission failed'; end if;
  if public.submit_overview_discovery(repeat('a',64),to_jsonb(array_fill('Replacement'::text,array[18]))) <> 'already_submitted' then raise exception 'Duplicate accepted'; end if;
  if public.read_business_overview(repeat('a',64)) ? 'discovery_answers' then raise exception 'Public answers leak'; end if;
  begin
    perform public.submit_overview_discovery(repeat('b',64),answers);
    raise exception 'Draft accepted';
  exception when raise_exception then
    if sqlerrm = 'Draft accepted' then raise; end if;
  end;
  begin
    perform public.submit_overview_discovery(repeat('c',64),answers);
    raise exception 'Expired accepted';
  exception when raise_exception then
    if sqlerrm = 'Expired accepted' then raise; end if;
  end;
end $$;
reset role;
do $$ begin
  if (select discovery_answers->>0 from public.business_overviews where share_token=repeat('a',64)) <> 'Synthetic business answer' then raise exception 'Original answer overwritten'; end if;
end $$;
select 'Discovery submission checks passed' as result;
