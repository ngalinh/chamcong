-- Error logs table — capture client-side + server-side errors for debugging
-- Apply via Supabase Dashboard SQL Editor

create table if not exists public.error_logs (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  level       text not null default 'error' check (level in ('error', 'warn', 'info')),
  message     text not null,
  stack       text,
  url         text,
  user_agent  text,
  user_id     uuid,
  employee_id uuid references public.employees(id) on delete set null,
  context     jsonb
);

create index if not exists idx_error_logs_created_at on public.error_logs (created_at desc);
create index if not exists idx_error_logs_employee  on public.error_logs (employee_id);

-- RLS: chỉ admin client (service role) ghi/đọc; user thường KHÔNG đọc trực tiếp
alter table public.error_logs enable row level security;
-- (không tạo policy nào → mọi truy cập từ anon/authenticated key đều bị từ chối,
--  chỉ service role bypass được RLS)
