-- ============================================================
-- Nghỉ theo giờ (leave_hourly): thêm start_time + end_time
-- để check-in API biết dịch giờ làm hiệu lực.
-- ============================================================

alter table public.leave_requests
  add column if not exists start_time time,
  add column if not exists end_time   time;

-- Index để API checkin tra cứu nhanh đơn nghỉ giờ trong ngày
create index if not exists leave_requests_hourly_lookup_idx
  on public.leave_requests (employee_id, leave_date)
  where category = 'leave_hourly' and status = 'approved';
