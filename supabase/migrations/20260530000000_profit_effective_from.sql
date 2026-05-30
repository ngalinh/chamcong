-- Thêm effective_from vào profit_rules và profit_channels
-- để hỗ trợ áp dụng thay đổi từ tháng này hoặc tháng sau

-- profit_rules: thêm effective_from, update unique constraint
ALTER TABLE profit_rules ADD COLUMN IF NOT EXISTS effective_from TEXT NOT NULL DEFAULT '';

-- Xoá unique constraint cũ
DO $$ BEGIN
  ALTER TABLE profit_rules DROP CONSTRAINT profit_rules_channel_name_brand_customer_group_key;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Unique mới bao gồm effective_from
ALTER TABLE profit_rules ADD CONSTRAINT profit_rules_channel_brand_cg_from_key
  UNIQUE (channel_name, brand, customer_group, effective_from);

-- profit_channels: thêm effective_from, update unique constraint
ALTER TABLE profit_channels ADD COLUMN IF NOT EXISTS effective_from TEXT NOT NULL DEFAULT '';

-- Xoá unique constraint cũ
DO $$ BEGIN
  ALTER TABLE profit_channels DROP CONSTRAINT profit_channels_channel_name_key;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Unique mới
ALTER TABLE profit_channels ADD CONSTRAINT profit_channels_name_from_key
  UNIQUE (channel_name, effective_from);

-- BẮT BUỘC: explicit grant (Supabase bỏ auto-grant từ 30/10/2026)
GRANT SELECT, INSERT, UPDATE, DELETE ON profit_rules TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON profit_channels TO authenticated, service_role;
