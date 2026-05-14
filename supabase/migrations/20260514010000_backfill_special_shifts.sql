-- ============================================================
-- Backfill ca làm việc đặc biệt (dùng cho push reminder chấm công).
-- Idempotent: chỉ set nếu cột đang null (không đè giá trị admin đã set tay).
--   - Dương Bảo Nghi: ca tối 20:00 → 00:00 (qua nửa đêm).
--   - Trần Thuỳ Trang: ca 09:00 → 17:00.
-- ============================================================

update public.employees
   set work_start_time = '20:00:00',
       work_end_time   = '00:00:00'
 where name ilike '%Dương Bảo Nghi%'
   and work_start_time is null
   and work_end_time   is null;

update public.employees
   set work_start_time = '09:00:00',
       work_end_time   = '17:00:00'
 where name ilike '%Trần Thu%Trang%'
   and work_start_time is null
   and work_end_time   is null;
