-- Đổi constraint để mỗi kênh có thể có nhiều nhóm KH trong cùng tháng
alter table public.dropship_revenue
  drop constraint if exists dropship_revenue_month_channel;

alter table public.dropship_revenue
  drop constraint if exists dropship_revenue_month_channel_group;

-- Xoá rows cũ có customer_group null trước khi add NOT NULL
delete from public.dropship_revenue where customer_group is null;

alter table public.dropship_revenue
  alter column customer_group set not null;

alter table public.dropship_revenue
  add constraint dropship_revenue_month_channel_group unique(month, channel_name, customer_group);
