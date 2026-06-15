-- Tách effective month riêng cho OT fixed salary để không xung đột
-- khi salary và OT được đổi vào những tháng khác nhau.
alter table employees
  add column if not exists ot_fixed_salary_pending_month text; -- YYYY-MM
