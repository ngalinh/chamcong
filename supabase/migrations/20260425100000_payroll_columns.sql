-- ============================================================
-- Payroll: thêm lương cứng + ngày nghỉ phép cho mỗi nhân viên.
--  - salary: lương cứng /tháng (VND)
--  - leave_balance: số ngày phép hiện có (có thể có .5)
--  - last_accrual_month: "YYYY-MM" tháng cuối cùng đã tự cộng +1
--    phép → idempotency cho button "Cộng phép tháng này".
-- ============================================================

alter table public.employees
  add column if not exists salary             numeric(12, 2) not null default 0,
  add column if not exists leave_balance      numeric(5, 1)  not null default 0,
  add column if not exists last_accrual_month text;
