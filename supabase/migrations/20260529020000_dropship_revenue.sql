-- Doanh thu Dropship nhập tay theo tháng + kênh NV
create table if not exists public.dropship_revenue (
  id           uuid primary key default gen_random_uuid(),
  month        varchar(7) not null,  -- "YYYY-MM"
  channel_name text not null,
  amount       numeric not null default 0,
  updated_at   timestamptz not null default now(),
  constraint dropship_revenue_month_channel unique(month, channel_name)
);

-- BẮT BUỘC: explicit grant (Supabase bỏ auto-grant từ 30/10/2026)
grant select, insert, update, delete on public.dropship_revenue to authenticated, service_role;
