-- ============================================================
-- Violation reports → mở rộng cho cả Thưởng:
--   - kind = 'bonus' (thưởng, cộng vào lương) hoặc 'violation' (vi phạm, trừ lương)
--   - Default 'violation' để các row cũ giữ nguyên semantics.
-- ============================================================

alter table public.violation_reports
  add column if not exists kind text not null default 'violation'
  check (kind in ('bonus', 'violation'));

create index if not exists violation_reports_kind_status_idx
  on public.violation_reports (kind, status, created_at desc);
