-- ============================================================
-- Leave request approval workflow
-- ============================================================

-- Status column — default 'pending', set to 'approved' khi admin duyệt qua Telegram
alter table public.leave_requests
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected'));

-- Metadata khi được duyệt
alter table public.leave_requests
  add column if not exists approved_at  timestamptz;
alter table public.leave_requests
  add column if not exists approved_by  text;  -- email admin

-- Metadata từ Telegram (để tránh duyệt trùng)
alter table public.leave_requests
  add column if not exists telegram_message_id  bigint;
alter table public.leave_requests
  add column if not exists telegram_chat_id     bigint;

create index if not exists leave_requests_status_idx
  on public.leave_requests (status, created_at desc);
