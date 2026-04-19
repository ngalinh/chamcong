-- ============================================================
-- Xin nghỉ + Alerts
-- ============================================================

create type leave_category as enum (
  'online_rain',   -- Làm online - trời mưa
  'online_wfh',    -- Làm online - WFH
  'online_paid',   -- Làm online - trừ phép
  'leave_hourly',  -- Nghỉ theo giờ
  'leave_paid',    -- Xin nghỉ trừ phép
  'leave_unpaid'   -- Xin nghỉ ko lương
);

create type duration_unit as enum ('day', 'hour');

create table public.leave_requests (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees(id) on delete cascade,
  leave_date     date not null,
  category       leave_category not null,
  duration       numeric(5,2) not null check (duration > 0),
  duration_unit  duration_unit not null,
  reason         text,
  created_at     timestamptz not null default now()
);

create index on public.leave_requests (employee_id, leave_date desc);
create index on public.leave_requests (leave_date desc);

-- Alerts (sinh ra từ job đối chiếu hàng tháng)
create table public.alerts (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid references public.employees(id) on delete cascade,
  alert_date   date not null,
  kind         text not null,     -- 'missing_checkin'
  message      text not null,
  resolved     boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (employee_id, alert_date, kind)
);

create index on public.alerts (resolved, alert_date desc);

-- ============================================================
-- RLS
-- ============================================================
alter table public.leave_requests enable row level security;
alter table public.alerts         enable row level security;

-- Nhân viên đọc/tạo/xoá leave request của chính mình; admin toàn quyền
create policy "lr_select_self"  on public.leave_requests for select
  using (
    exists (select 1 from public.employees e where e.id = employee_id and e.user_id = auth.uid())
    or public.is_admin()
  );

create policy "lr_admin_all"    on public.leave_requests for all
  using (public.is_admin()) with check (public.is_admin());

-- Alerts: chỉ admin đọc/sửa
create policy "al_admin_all"    on public.alerts for all
  using (public.is_admin()) with check (public.is_admin());
