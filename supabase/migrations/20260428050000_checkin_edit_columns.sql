-- ============================================================
-- Check-ins: thêm cột metadata cho admin sửa / thêm thủ công
--   - edited_at / edited_by / edit_reason: khi admin sửa giờ/loại
--   - created_by_admin_email: khi admin thêm 1 record thủ công
--     (NV quên check-in hoặc check-out)
-- ============================================================

alter table public.check_ins
  add column if not exists edited_at              timestamptz,
  add column if not exists edited_by              text,
  add column if not exists edit_reason            text,
  add column if not exists created_by_admin_email text;
