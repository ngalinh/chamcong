-- ============================================================
-- leave_requests.wage_deduction_override
-- Admin có thể edit số tiền trừ lương cho 1 đơn nghỉ theo giờ trên
-- bảng lương. NULL = dùng giá trị compute (hours × hourRate).
-- Set 1 số > 0 = override (vd nếu muốn miễn 1 phần).
-- Set 0 = miễn hoàn toàn (không trừ lương).
-- ============================================================

alter table public.leave_requests
  add column if not exists wage_deduction_override numeric(12, 2);
