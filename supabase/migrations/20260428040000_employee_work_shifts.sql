-- ============================================================
-- Multi-shift cho NV parttime (đặc biệt làm online):
-- 1 NV có thể có nhiều ca trong 1 ngày, vd 09:00-12:00 + 14:00-17:00.
--
-- work_shifts: jsonb array of { start: "HH:MM:SS", end: "HH:MM:SS" }.
-- Nếu length > 0 → ưu tiên dùng cái này thay vì work_start_time/work_end_time.
-- Nếu rỗng → fallback work_start_time/work_end_time (single shift) → fallback office.
-- ============================================================

alter table public.employees
  add column if not exists work_shifts jsonb not null default '[]'::jsonb;
