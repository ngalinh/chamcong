-- Lưu preference ca nào NV muốn nhận push reminder chấm công.
-- Rỗng [] = tất cả ca; [0] = chỉ ca 1; [1] = chỉ ca 2; v.v.
alter table public.employees
  add column if not exists reminder_shift_indices int[] not null default '{}'::int[];
