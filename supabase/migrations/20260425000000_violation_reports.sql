-- ============================================================
-- Violation reports: NV tự khai vi phạm + tiền phạt, admin duyệt.
-- 1 đơn (parent) có nhiều lỗi (children). Tổng tiền denormalize
-- vào parent để query list nhanh, item chỉ load khi xem chi tiết.
-- ============================================================

create table if not exists public.violation_reports (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  report_date   date not null,
  total_amount  numeric(12, 2) not null default 0,
  reason        text,
  status        text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  approved_at   timestamptz,
  approved_by   text,
  created_at    timestamptz not null default now()
);

create table if not exists public.violation_items (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.violation_reports(id) on delete cascade,
  description   text not null,
  amount        numeric(12, 2) not null check (amount >= 0),
  position      smallint not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists violation_reports_employee_idx
  on public.violation_reports (employee_id, created_at desc);
create index if not exists violation_reports_status_idx
  on public.violation_reports (status, created_at desc);
create index if not exists violation_items_report_idx
  on public.violation_items (report_id, position);

alter table public.violation_reports enable row level security;
alter table public.violation_items   enable row level security;

drop policy if exists "vr_select_self_or_admin" on public.violation_reports;
create policy "vr_select_self_or_admin" on public.violation_reports for select
  using (
    exists (select 1 from public.employees e where e.id = employee_id and e.user_id = auth.uid())
    or public.is_admin()
  );
drop policy if exists "vr_admin_all" on public.violation_reports;
create policy "vr_admin_all" on public.violation_reports for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "vi_select_self_or_admin" on public.violation_items;
create policy "vi_select_self_or_admin" on public.violation_items for select
  using (
    exists (
      select 1 from public.violation_reports vr
      join public.employees e on e.id = vr.employee_id
      where vr.id = report_id and e.user_id = auth.uid()
    )
    or public.is_admin()
  );
drop policy if exists "vi_admin_all" on public.violation_items;
create policy "vi_admin_all" on public.violation_items for all
  using (public.is_admin()) with check (public.is_admin());
