-- Lưu thay đổi lương cứng "tháng sau": chưa áp dụng ngay
-- mà đợi đến salary_pending_month mới dùng trong tính lương.
alter table employees
  add column if not exists salary_pending          numeric(12,2),
  add column if not exists ot_fixed_salary_pending numeric(12,2),
  add column if not exists salary_pending_month    text; -- YYYY-MM

-- BẮT BUỘC: explicit grant (Supabase bỏ auto-grant từ 30/10/2026)
-- (cột mới trên bảng cũ, không cần grant lại — nhưng để tường minh)
