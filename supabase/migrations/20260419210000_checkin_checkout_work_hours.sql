-- ============================================================
-- Check-in / Check-out + Office work hours + late/early tracking
-- ============================================================

-- check_ins: thêm kind ('in' | 'out') + late/early minutes
alter table public.check_ins
  add column if not exists kind text not null default 'in'
    check (kind in ('in', 'out'));

alter table public.check_ins
  add column if not exists late_minutes  int;   -- >0 nếu check-in sau giờ làm
alter table public.check_ins
  add column if not exists early_minutes int;   -- >0 nếu check-out trước giờ về

create index if not exists check_ins_employee_kind_day_idx
  on public.check_ins (employee_id, kind, checked_in_at desc);

-- offices: thêm giờ làm việc
alter table public.offices
  add column if not exists work_start_time time not null default '09:00:00';
alter table public.offices
  add column if not exists work_end_time   time not null default '18:00:00';
