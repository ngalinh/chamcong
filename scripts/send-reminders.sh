#!/bin/bash
# Push reminder "hãy chấm công nhé" cho NV active đúng vào giờ bắt đầu / kết thúc
# ca làm. Gọi qua cron mỗi 5 phút (cài bằng scripts/setup-backup.sh).
#
# Endpoint /api/admin/shift-reminders auth bằng header X-Admin-Secret = $AUDIT_CRON_SECRET.
# Idempotent: route dedup qua bảng shift_reminders_sent — chạy lại không gửi trùng.

set -euo pipefail

APP_DIR="/opt/chamcong"
ENV_FILE="$APP_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "[$(date -Is)] Missing $ENV_FILE — skip" >&2
  exit 0
fi

# Đọc AUDIT_CRON_SECRET (chỉ biến cần — tránh export toàn bộ .env)
AUDIT_CRON_SECRET=$(grep -E '^AUDIT_CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"')
if [ -z "${AUDIT_CRON_SECRET:-}" ]; then
  echo "[$(date -Is)] AUDIT_CRON_SECRET trống — skip" >&2
  exit 0
fi

curl -fsS -m 30 -X POST "http://localhost:3000/api/admin/shift-reminders?window=5" \
  -H "X-Admin-Secret: $AUDIT_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}' \
  | sed "s/^/[$(date -Is)] /"
