-- Check-in admin thêm thủ công (NV quên chấm) không tính muộn / về sớm.
-- Xoá late/early đã lưu trên các check-in thủ công cũ (vd Hue Nguyen 28/09/2026
-- bị muộn nặng 270p do recalc khi duyệt đơn WFH chiều).
update public.check_ins
set late_minutes = null, early_minutes = null
where created_by_admin_email is not null
  and (coalesce(late_minutes, 0) > 0 or coalesce(early_minutes, 0) > 0);

-- Bảng lương tháng 10/2026 trở về trước chưa chốt sẽ tự tính lại; xoá snapshot
-- tháng 09 và 10/2026 của NV bị ảnh hưởng để không còn hiện số cũ.
delete from public.payroll_snapshots ps
where ps.year_month in ('2026-09', '2026-10')
  and exists (
    select 1 from public.check_ins c
    where c.employee_id = ps.employee_id
      and c.created_by_admin_email is not null
      and to_char(c.checked_in_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') = ps.year_month
  );
