-- ============================================================
-- Cho phép leave_balance lưu 2 chữ số thập phân (0.25, 2.75, ...).
-- Trước: numeric(5, 1) → chỉ .0/.5.
-- Sau:   numeric(6, 2) → 0.00 → 9999.99, đủ cho .25/.5/.75.
-- Use case: NV hết phép, làm online 0.5 ngày → trừ 0.25 phép →
-- balance lẻ .25 cần lưu được.
-- ============================================================

alter table public.employees
  alter column leave_balance type numeric(6, 2);
