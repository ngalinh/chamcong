-- Lưu mốc thời gian xoá NV để "Tổng kết lương" biết NV đã xoá còn active
-- ở tháng nào trong quá khứ (để hiện đúng lịch sử thay vì ẩn hẳn mọi tháng).
alter table public.employees
  add column if not exists deleted_at timestamptz;
