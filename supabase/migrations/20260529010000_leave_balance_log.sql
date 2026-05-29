create table public.leave_balance_log (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  changed_at timestamptz not null default now(),
  delta numeric(6, 2) not null,
  balance_after numeric(6, 2) not null,
  event_type text not null, -- 'accrual' | 'admin_edit' | 'leave_approved' | 'leave_rejected'
  note text,
  leave_request_id uuid references public.leave_requests(id) on delete set null
);

create index on public.leave_balance_log (employee_id, changed_at desc);

-- BẮT BUỘC: explicit grant (Supabase bỏ auto-grant từ 30/10/2026)
grant select, insert, delete on public.leave_balance_log to authenticated, service_role;
