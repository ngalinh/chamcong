-- Backfill deleted_at cho các NV đã bị xoá TRƯỚC KHI có cột deleted_at
-- (migration 20260805010000) — nếu để null, "Tổng kết lương" sẽ hiện lương
-- của họ vô thời hạn (bug đã gặp thực tế). Dùng hoạt động thực tế cuối cùng
-- (check-in / đơn nghỉ / đơn OT / báo cáo tự khai gần nhất) làm mốc coi như
-- "còn active tới tháng đó" — fallback về created_at nếu NV chưa có hoạt
-- động gì (xoá ngay sau khi tạo).
update public.employees e
set deleted_at = greatest(
  coalesce((select max(checked_in_at) from public.check_ins where employee_id = e.id), e.created_at),
  coalesce((select max(leave_date)::timestamptz from public.leave_requests where employee_id = e.id), e.created_at),
  coalesce((select max(ot_date)::timestamptz from public.overtime_requests where employee_id = e.id), e.created_at),
  coalesce((select max(report_date)::timestamptz from public.violation_reports where employee_id = e.id), e.created_at),
  e.created_at
)
where e.is_active = false and e.deleted_at is null;
