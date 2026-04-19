-- ============================================================
-- Web Push subscriptions
-- ============================================================

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  unique (endpoint)
);

create index if not exists push_subscriptions_employee_idx
  on public.push_subscriptions (employee_id);

alter table public.push_subscriptions enable row level security;

-- Nhân viên quản lý subscription của chính mình; admin xem tất cả
create policy "ps_self" on public.push_subscriptions for all
  using (
    exists (select 1 from public.employees e where e.id = employee_id and e.user_id = auth.uid())
    or public.is_admin()
  )
  with check (
    exists (select 1 from public.employees e where e.id = employee_id and e.user_id = auth.uid())
    or public.is_admin()
  );
