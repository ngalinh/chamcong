-- Kênh Basso: áp dụng tính profit theo Kênh sale từ tháng 7/2026 (không tính lùi về trước)
-- Xoá row mặc định (effective_from='') nếu migration trước đã tạo, thay bằng row effective_from='2026-07'

delete from public.profit_channels
where channel_name = 'Basso' and effective_from = '';

insert into public.profit_channels (channel_name, effective_from, sale_pct, cskh_pct)
values ('Basso', '2026-07', 0, 0)
on conflict (channel_name, effective_from) do nothing;
