-- Thêm kênh Sale "Basso" (giống pattern thêm ShipUS trước đó)

insert into public.profit_channels (channel_name, sale_pct, cskh_pct)
values ('Basso', 0, 0)
on conflict (channel_name, effective_from) do nothing;
