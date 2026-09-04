-- Sửa dữ liệu được tạo bởi form xin nghỉ nhiều ngày trước bản vá 2026-08-04.
-- API tạo một row cho mỗi ngày nhưng client cũ gán tổng số ngày vào duration
-- của tất cả row, khiến bảng lương tính N ngày cho từng row (tổng cộng N²).
--
-- Các row của cùng một lần insert có employee/category/created_at giống nhau.
-- Chỉ sửa nhóm có N > 1 row, duration = N và đơn vị ngày để không đụng tới
-- đơn lẻ hoặc nghỉ nửa ngày hợp lệ.
with malformed_batches as (
  select employee_id, category, created_at, duration
  from public.leave_requests
  where category in ('leave_paid', 'online_wfh', 'online_rain')
    and duration_unit = 'day'
    and duration > 1
  group by employee_id, category, created_at, duration
  having count(*) > 1
     and count(*) = duration
)
update public.leave_requests lr
set duration = 1
from malformed_batches batch
where lr.employee_id = batch.employee_id
  and lr.category = batch.category
  and lr.created_at = batch.created_at
  and lr.duration = batch.duration
  and lr.duration_unit = 'day';
