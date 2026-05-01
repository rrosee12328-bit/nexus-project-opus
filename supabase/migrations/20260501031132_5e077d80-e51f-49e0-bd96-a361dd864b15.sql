create table if not exists public.pdf_endpoint_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id text not null,
  call_id uuid,
  user_id uuid,
  fn text not null,
  level text not null,
  event text not null,
  elapsed_ms integer,
  data jsonb not null default '{}'::jsonb
);

create index if not exists idx_pdf_endpoint_logs_request_id on public.pdf_endpoint_logs (request_id);
create index if not exists idx_pdf_endpoint_logs_call_id on public.pdf_endpoint_logs (call_id);
create index if not exists idx_pdf_endpoint_logs_created_at on public.pdf_endpoint_logs (created_at desc);

alter table public.pdf_endpoint_logs enable row level security;

create policy "Admins can read pdf endpoint logs"
on public.pdf_endpoint_logs
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete pdf endpoint logs"
on public.pdf_endpoint_logs
for delete
to authenticated
using (public.has_role(auth.uid(), 'admin'));