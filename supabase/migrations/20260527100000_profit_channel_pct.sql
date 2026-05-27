-- Move sale_pct/cskh_pct từ profit_rules sang profit_channels
-- Thêm kênh ShipUS cố định

alter table public.profit_channels
  add column if not exists sale_pct numeric not null default 0,
  add column if not exists cskh_pct numeric not null default 0;

alter table public.profit_rules
  drop column if exists sale_pct,
  drop column if exists cskh_pct;

-- Thêm kênh ShipUS nếu chưa có
insert into public.profit_channels (channel_name, sale_pct, cskh_pct)
values ('ShipUS', 0, 0)
on conflict (channel_name) do nothing;
