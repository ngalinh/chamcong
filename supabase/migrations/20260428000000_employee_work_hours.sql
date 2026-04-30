-- ============================================================
-- Per-employee work hours override
-- - work_start_time / work_end_time: NULL = dùng giờ chi nhánh,
--   nếu set → override riêng cho NV này.
-- - Đặc biệt hữu ích cho NV "Làm online" (mỗi NV có schedule riêng)
--   hoặc NV ca chiều / ca khuya của chi nhánh thật.
-- ============================================================

alter table public.employees
  add column if not exists work_start_time time,
  add column if not exists work_end_time   time;
