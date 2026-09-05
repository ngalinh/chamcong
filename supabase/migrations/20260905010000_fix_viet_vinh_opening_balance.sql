-- Khôi phục số dư phép đầu kỳ tháng 05/2026 của Viết Vinh về 1 ngày.
-- Marker "admin nhập" giúp payroll không nhầm giá trị 1 này với lần
-- cộng 1 ngày phép tự động và dựng lại nó từ tháng trước.
do $$
declare
  target_employee_id uuid;
begin
  select id into target_employee_id
  from public.employees
  where lower(email) = 'skullmasher880@gmail.com'
  limit 1;

  if target_employee_id is null then
    return;
  end if;

  update public.employees
  set leave_balance = 1,
      last_accrual_month = '2026-05'
  where id = target_employee_id;

  update public.leave_balance_log
  set delta = 1,
      balance_after = 1,
      note = 'Số dư phép đầu kỳ 2026-05 (admin nhập)'
  where employee_id = target_employee_id
    and event_type = 'accrual'
    and note ilike '%2026-05%';

  if not found then
    insert into public.leave_balance_log (
      employee_id, delta, balance_after, event_type, note
    ) values (
      target_employee_id,
      1,
      1,
      'accrual',
      'Số dư phép đầu kỳ 2026-05 (admin nhập)'
    );
  end if;

  delete from public.payroll_snapshots
  where employee_id = target_employee_id
    and year_month >= '2026-05';
end
$$;
