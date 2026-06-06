-- payroll_transfers: lưu số tiền CK từ tài khoản công ty cho mỗi NV theo tháng.
-- ck_ca_nhan = tổng lương - ck_cong_ty (tính ở client, không lưu DB).

create table if not exists public.payroll_transfers (
  id          uuid        primary key default gen_random_uuid(),
  employee_id uuid        not null references public.employees(id) on delete cascade,
  month       text        not null,  -- YYYY-MM
  ck_cong_ty  bigint      not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (employee_id, month)
);

-- BẮT BUỘC: explicit grant (Supabase bỏ auto-grant từ 30/10/2026)
grant select, insert, update, delete on public.payroll_transfers to authenticated, service_role;
