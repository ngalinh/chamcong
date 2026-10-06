-- Check-in admin thêm thủ công (NV quên chấm) không tính muộn / về sớm.
-- Xoá late/early đã lưu trên các check-in thủ công từ 01/09/2026 (vd Hue Nguyen
-- 28/09/2026 bị muộn nặng 270p do recalc khi duyệt đơn WFH chiều). Tháng trước
-- giữ nguyên để khớp bảng lương đã chốt.
update public.check_ins
set late_minutes = null, early_minutes = null
where created_by_admin_email is not null
  and checked_in_at >= '2026-09-01T00:00:00+07:00'
  and (coalesce(late_minutes, 0) > 0 or coalesce(early_minutes, 0) > 0);

-- Xoá snapshot bảng lương tháng 09-10/2026 của NV có check-in thủ công để bảng
-- lương tính lại từ data live (giống app làm khi thêm/sửa check-in).
delete from public.payroll_snapshots ps
where ps.year_month in ('2026-09', '2026-10')
  and exists (
    select 1 from public.check_ins c
    where c.employee_id = ps.employee_id
      and c.created_by_admin_email is not null
      and to_char(c.checked_in_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') = ps.year_month
  );
