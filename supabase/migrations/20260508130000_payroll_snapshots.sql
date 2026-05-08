-- ============================================================
-- payroll_snapshots: lưu kết quả tính bảng lương cho từng (NV, tháng)
-- để khi cleanup-history xoá data cũ, bảng lương các tháng đã qua
-- vẫn hiển thị đầy đủ. Snapshot được tạo lazy bởi cron cleanup
-- TRƯỚC khi DELETE check_ins/leave/OT/violations.
--
-- Cột data jsonb: chứa cả PayrollResult (fulltime) hoặc
-- ParttimePayrollResult kèm workShifts (parttime). Shape khớp với
-- PayrollSnapshotPayload ở src/lib/payroll-snapshot.ts.
--
-- UNIQUE(employee_id, year_month): idempotent — INSERT ... ON CONFLICT
-- DO NOTHING để chạy lại cron không ghi đè snapshot cũ (data đã bị
-- xoá rồi → recompute sẽ ra rỗng/sai).
-- ============================================================

create table if not exists public.payroll_snapshots (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  year_month text not null check (year_month ~ '^\d{4}-\d{2}$'),
  data jsonb not null,
  created_at timestamptz not null default now(),
  unique (employee_id, year_month)
);

create index if not exists payroll_snapshots_year_month_idx
  on public.payroll_snapshots (year_month);
