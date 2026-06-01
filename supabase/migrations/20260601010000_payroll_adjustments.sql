create table public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  month text not null, -- YYYY-MM
  label text not null,
  amount bigint not null, -- dương = cộng thêm, âm = trừ
  created_by text,
  created_at timestamptz default now()
);

create index on public.payroll_adjustments (employee_id, month);

-- BẮT BUỘC: explicit grant (Supabase bỏ auto-grant từ 30/10/2026)
grant select, insert, update, delete on public.payroll_adjustments to authenticated, service_role;
