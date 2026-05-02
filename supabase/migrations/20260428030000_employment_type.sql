-- ============================================================
-- Parttime employees: lương theo giờ thay vì lương cứng tháng.
--   - employment_type: 'fulltime' (default, tính theo lương cứng tháng + ngày phép)
--                      'parttime'  (tính theo giờ check-in/out + giờ OT approved)
--   - hourly_rate: lương VND/giờ (chỉ dùng cho parttime)
--   - overtime_rate: lương VND/giờ làm OT (chỉ dùng cho parttime)
-- ============================================================

alter table public.employees
  add column if not exists employment_type text not null default 'fulltime'
    check (employment_type in ('fulltime', 'parttime')),
  add column if not exists hourly_rate    numeric(12, 2) not null default 0,
  add column if not exists overtime_rate  numeric(12, 2) not null default 0;
