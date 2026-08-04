-- UI (ApplyFromSubmit) không cho áp dụng thay đổi lùi về tháng 7 — chỉ cho
-- "tháng này"/"tháng sau" tại thời điểm sửa. Nên khi admin gán Nguyễn Duy Bình
-- + % cho kênh Basso qua /admin/settings, nó chỉ tạo row hiệu lực từ tháng
-- hiện tại (8) hoặc tháng sau (9) trở đi — row tháng 7 (tạo bởi migration
-- trước) vẫn chưa có ai.
--
-- Copy thẳng row Basso mới nhất (đã set qua UI) sang row hiệu lực tháng 7,
-- để tháng 7 tính profit đúng % đã cấu hình.

with latest as (
  select sale_employee_id, cskh_employee_id, sale_pct, cskh_pct
  from public.profit_channels
  where channel_name = 'Basso' and effective_from > '2026-07'
  order by effective_from desc
  limit 1
)
update public.profit_channels pc
set sale_employee_id = latest.sale_employee_id,
    cskh_employee_id = latest.cskh_employee_id,
    sale_pct = latest.sale_pct,
    cskh_pct = latest.cskh_pct
from latest
where pc.channel_name = 'Basso' and pc.effective_from = '2026-07';

-- Kiểm tra lại sau khi chạy:
-- select * from public.profit_channels where channel_name = 'Basso' order by effective_from;
