-- ============================================================
-- Backfill: chuyển hardcode override của Trâm Trương sang DB
-- (workHours.ts trước có entry "trammy.truong@gmail.com": { start: "13:30:00" }).
-- Sau khi tính năng set giờ làm qua UI có sẵn, hardcode đã được xoá.
-- Chạy migration này để Trâm vẫn có giờ làm 13:30 → giờ chi nhánh end_time.
-- Idempotent — chỉ update nếu cột đang null.
-- ============================================================

update public.employees
   set work_start_time = '13:30:00'
 where lower(email) = 'trammy.truong@gmail.com'
   and work_start_time is null;
