-- ============================================================
-- company_holidays: ngày nghỉ chung của công ty (lễ, tết, off công ty…).
-- Áp dụng cho TOÀN BỘ nhân viên: ngày này không yêu cầu check-in,
-- không tính vắng không phép. NV vẫn nhận đủ lương tháng (không
-- giảm workdays để tính dayRate — tương tự logic T7 làm online).
--
-- UNIQUE(holiday_date) để admin không add duplicate.
-- ============================================================

create table if not exists public.company_holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null,
  reason text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (holiday_date)
);

create index if not exists company_holidays_date_idx
  on public.company_holidays (holiday_date);
