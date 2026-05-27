-- ot_fixed_salary: lương OT cố định hàng tháng (cho fulltime)
alter table public.employees
  add column if not exists ot_fixed_salary numeric;

-- order_files: metadata file Excel upload mỗi tháng (1 file/tháng)
create table if not exists public.order_files (
  id          uuid primary key default gen_random_uuid(),
  month       varchar(7) not null,
  original_filename text not null,
  row_count   int not null default 0,
  uploaded_by text,
  created_at  timestamptz default now(),
  constraint order_files_month_unique unique(month)
);

-- BẮT BUỘC: explicit grant (Supabase bỏ auto-grant từ 30/10/2026)
grant select, insert, update, delete on public.order_files to authenticated, service_role;

-- order_data: rows parse từ Excel
create table if not exists public.order_data (
  id             bigserial primary key,
  file_id        uuid not null references public.order_files(id) on delete cascade,
  month          varchar(7) not null,
  completed_at   text,
  order_code     text,
  customer       text,
  brand          text,
  customer_group text,
  sale_channel   text,
  amount         numeric not null default 0
);

create index if not exists order_data_file_id_idx on public.order_data(file_id);
create index if not exists order_data_month_chan_idx on public.order_data(month, sale_channel);

grant select, insert, update, delete on public.order_data to authenticated, service_role;
grant usage, select on sequence public.order_data_id_seq to authenticated, service_role;

-- profit_channels: map kênh NV → tài khoản SALE / CSKH
create table if not exists public.profit_channels (
  id               uuid primary key default gen_random_uuid(),
  channel_name     text not null unique,
  sale_employee_id uuid references public.employees(id) on delete set null,
  cskh_employee_id uuid references public.employees(id) on delete set null,
  created_at       timestamptz default now()
);

grant select, insert, update, delete on public.profit_channels to authenticated, service_role;

-- profit_rules: % profit theo kênh + brand + nhóm KH
create table if not exists public.profit_rules (
  id             uuid primary key default gen_random_uuid(),
  channel_name   text not null,
  brand          text not null,
  customer_group text not null,
  profit_pct     numeric not null, -- vd 0.02 = 2%
  sale_pct       numeric not null, -- vd 0.70 = 70% của profit
  cskh_pct       numeric not null, -- vd 0.30 = 30% của profit
  created_at     timestamptz default now(),
  constraint profit_rules_unique unique(channel_name, brand, customer_group)
);

grant select, insert, update, delete on public.profit_rules to authenticated, service_role;
