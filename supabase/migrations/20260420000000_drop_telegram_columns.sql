-- ============================================================
-- Drop unused Telegram columns
-- Bot approval flow đã được thay bằng in-app admin buttons (commit a701b68).
-- ============================================================

alter table public.leave_requests
  drop column if exists telegram_message_id;
alter table public.leave_requests
  drop column if exists telegram_chat_id;
