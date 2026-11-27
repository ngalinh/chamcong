-- ============================================================
-- employment_type có hiệu lực theo tháng:
--   employment_type_from_month (YYYY-MM): loại NV hiện tại áp dụng từ tháng này,
--   các tháng trước tính lương theo loại còn lại. null = áp dụng mọi tháng.
--
-- Phương Hà Mai chuyển fulltime → parttime (lương theo giờ) từ tháng 11/2026:
-- tháng 10 trở về trước vẫn tính lương fulltime.
-- ============================================================

alter table public.employees
  add column if not exists employment_type_from_month text
    check (employment_type_from_month is null or employment_type_from_month ~ '^\d{4}-\d{2}$');

update public.employees
set employment_type = 'parttime',
    employment_type_from_month = '2026-11'
where name ilike '%Phương Hà Mai%';

-- Xoá snapshot tháng 11 trở đi (nếu có) để tính lại theo parttime
delete from public.payroll_snapshots
where year_month >= '2026-11'
  and employee_id in (select id from public.employees where name ilike '%Phương Hà Mai%');

-- Kiểm tra: phải ra đúng 1 dòng, employment_type = parttime, hourly_rate > 0
select id, name, employment_type, employment_type_from_month, hourly_rate, overtime_rate
from public.employees
where name ilike '%Phương Hà Mai%';
