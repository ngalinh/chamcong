-- ============================================================
-- Dedup table cho push reminder chấm công đầu/cuối ca.
-- Cron /api/admin/shift-reminders chạy mỗi 5 phút, chèn 1 row mỗi
-- (employee, ngày VN, shift_index, kind) để bảo đảm 1 reminder / shift / ngày.
-- /api/admin/cleanup-history sẽ xoá row cũ theo retention chung.
-- ============================================================

create table public.shift_reminders_sent (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  reminder_date date not null,
  shift_index   int  not null default 0,
  kind          text not null check (kind in ('start','end')),
  sent_at       timestamptz not null default now(),
  unique (employee_id, reminder_date, shift_index, kind)
);

create index shift_reminders_sent_date_idx
  on public.shift_reminders_sent (reminder_date desc);

-- BẮT BUỘC: explicit grant (Supabase bỏ auto-grant từ 30/10/2026)
grant select, insert, update, delete on public.shift_reminders_sent
  to authenticated, service_role;
