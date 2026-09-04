-- Khôi phục số dư mở sổ tháng 05/2026 đã bị logic rebuild lịch sử ghi đè.
-- delta cũng được đặt về 2.5 để đánh dấu đây là anchor admin nhập tay; các lần
-- tính bảng lương sau sẽ không dựng ngược tháng 5 từ dữ liệu tháng 4.
update public.leave_balance_log log
set delta = 2.5,
    balance_after = 2.5
from public.employees employee
where log.employee_id = employee.id
  and lower(employee.email) = 'binhhuyen2006@gmail.com'
  and log.event_type = 'accrual'
  and log.note ilike '%2026-05%';
