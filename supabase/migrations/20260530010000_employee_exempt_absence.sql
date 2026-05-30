-- Thêm cột exempt_absence cho nhân viên không cần chấm công
-- (không bị trừ lương vắng không phép)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS exempt_absence BOOLEAN NOT NULL DEFAULT FALSE;

GRANT SELECT, INSERT, UPDATE, DELETE ON employees TO authenticated, service_role;
