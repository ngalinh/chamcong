-- Nhân viên hưởng một tỷ lệ trên tổng profit của toàn công ty theo từng tháng.
create table if not exists public.profit_total_shares (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees(id) on delete cascade,
  profit_pct     numeric not null check (profit_pct >= 0 and profit_pct <= 1),
  effective_from text not null default '',
  created_at     timestamptz not null default now(),
  constraint profit_total_shares_employee_from_key unique(employee_id, effective_from)
);

create index if not exists profit_total_shares_employee_idx
  on public.profit_total_shares(employee_id);

grant select, insert, update, delete on public.profit_total_shares to authenticated, service_role;
