-- ============================================================
-- Branches features:
--  - is_remote office ("Làm online") + approver_email per office
--  - Overtime requests
--  - Allow nullable check-in fields cho remote check-in
-- ============================================================

-- 1. Offices: cờ remote + email admin duyệt nghỉ cho chi nhánh đó
alter table public.offices
  add column if not exists is_remote      boolean not null default false,
  add column if not exists approver_email text;

-- Backfill approver_email theo tên (best-effort, admin có thể sửa lại trong UI)
update public.offices
   set approver_email = 'dzuong.bol@gmail.com'
 where approver_email is null
   and (name ilike '%hà nội%' or name ilike '%hanoi%' or name ilike '%hà-nội%');

update public.offices
   set approver_email = 'ngalinh0311@gmail.com'
 where approver_email is null
   and (name ilike '%sài gòn%' or name ilike '%saigon%' or name ilike '%sài-gòn%' or name ilike '%test%');

-- Insert "Làm online" remote office (chỉ 1 dòng, không lat/lng thật)
insert into public.offices (name, address, latitude, longitude, radius_m, is_active, is_remote, approver_email)
select 'Làm online', null, 0, 0, 0, true, true, null
 where not exists (select 1 from public.offices where is_remote = true);

-- 2. Cho phép check_ins remote (không có ảnh / vị trí)
alter table public.check_ins
  alter column selfie_path drop not null;

-- 3. Overtime requests
create table if not exists public.overtime_requests (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  ot_date       date not null,
  start_time    time not null,
  end_time      time not null,
  hours         numeric(5,2) not null,
  reason        text,
  status        text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  approved_at   timestamptz,
  approved_by   text,
  created_at    timestamptz not null default now()
);

create index if not exists overtime_requests_status_idx
  on public.overtime_requests (status, created_at desc);
create index if not exists overtime_requests_employee_idx
  on public.overtime_requests (employee_id, created_at desc);

alter table public.overtime_requests enable row level security;

drop policy if exists "ot_select_self_or_admin" on public.overtime_requests;
create policy "ot_select_self_or_admin" on public.overtime_requests for select
  using (
    exists (select 1 from public.employees e where e.id = employee_id and e.user_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "ot_admin_all" on public.overtime_requests;
create policy "ot_admin_all" on public.overtime_requests for all
  using (public.is_admin()) with check (public.is_admin());
