-- ============================================================
-- excused_absences: admin "miễn trừ" 1 ngày vắng không phép cho NV.
-- Insert 1 row → ngày đó không còn xuất hiện trong "Vắng không phép"
-- và không bị trừ lương. Tương đương 1 đơn nghỉ duyệt sẵn nhưng không
-- ăn vào quỹ phép.
--
-- UNIQUE(employee_id, absence_date) để idempotent + phân biệt với đơn
-- nghỉ thường (leave_requests có category, đây là pure "miễn trừ").
-- ============================================================

create table if not exists public.excused_absences (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  absence_date date not null,
  reason text,
  excused_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (employee_id, absence_date)
);

create index if not exists excused_absences_emp_date_idx
  on public.excused_absences (employee_id, absence_date);
