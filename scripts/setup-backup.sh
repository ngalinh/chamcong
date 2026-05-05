#!/bin/bash
# Setup nightly backup + cleanup cho Chấm công.
# Chạy 1 lần trên server công ty:
#
#   ssh -i ~/.ssh/chamcong_deploy vmadmin@103.140.249.232
#   cd /opt/chamcong
#   git pull
#   bash scripts/setup-backup.sh
#
# Idempotent: chạy lại không gây hỏng gì.

set -euo pipefail

APP_DIR="/opt/chamcong"
ENV_FILE="$APP_DIR/.env"
CRON_LINE="30 2 * * * $APP_DIR/scripts/backup.sh >> /var/log/chamcong-backup.log 2>&1"

cd "$APP_DIR"

echo "═══════════════════════════════════════════════════════"
echo "  Setup backup nightly Chấm công"
echo "═══════════════════════════════════════════════════════"

# ── 1. Cài postgresql-client (cần pg_dump) ──
echo ""
echo "[1/5] Kiểm tra pg_dump..."
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "      Đang cài postgresql-client..."
  # Đợi unattended-upgrades / apt khác xong (Ubuntu hay chạy auto update background)
  WAIT=0
  while sudo fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || \
        sudo fuser /var/lib/dpkg/lock         >/dev/null 2>&1 || \
        sudo fuser /var/cache/apt/archives/lock >/dev/null 2>&1; do
    if [ "$WAIT" -eq 0 ]; then
      echo "      ⏳ Đợi process apt khác (unattended-upgrades?) xong..."
    fi
    WAIT=$((WAIT + 1))
    if [ "$WAIT" -gt 120 ]; then
      echo "      ✗ Đợi 10 phút mà apt vẫn lock — kill thủ công: sudo kill \$(pgrep -x unattended-upgr)"
      exit 1
    fi
    sleep 5
  done

  # apt-get update có thể fail do Ubuntu mirror tạm flaky (HTTP 520, "no longer signed", ...)
  # → retry 3 lần. Nếu vẫn fail, vẫn thử install (apt cache cũ có thể đủ).
  for i in 1 2 3; do
    if sudo apt-get update -qq; then
      break
    fi
    if [ "$i" -lt 3 ]; then
      echo "      ⚠ apt-get update fail (lần $i/3), thử lại sau 10s..."
      sleep 10
    else
      echo "      ⚠ apt-get update vẫn fail — thử install bằng cache cũ..."
    fi
  done

  if ! sudo apt-get install -y postgresql-client; then
    echo "      ✗ apt-get install fail. Thử thủ công khi mạng ổn:"
    echo "        sudo apt-get update && sudo apt-get install -y postgresql-client"
    echo "        rồi chạy lại: bash $APP_DIR/scripts/setup-backup.sh"
    exit 1
  fi
  echo "      ✓ Đã cài $(pg_dump --version)"
else
  echo "      ✓ Đã có $(pg_dump --version)"
fi

# ── 2. Đảm bảo có AUDIT_CRON_SECRET ──
echo ""
echo "[2/5] Kiểm tra AUDIT_CRON_SECRET trong .env..."
if [ ! -f "$ENV_FILE" ]; then
  echo "      ✗ Không thấy $ENV_FILE — script này phải chạy sau khi đã deploy app."
  exit 1
fi

if ! grep -q "^AUDIT_CRON_SECRET=" "$ENV_FILE"; then
  SECRET=$(openssl rand -hex 32)
  echo "" >> "$ENV_FILE"
  echo "AUDIT_CRON_SECRET=$SECRET" >> "$ENV_FILE"
  echo "      ✓ Đã thêm AUDIT_CRON_SECRET (random 256-bit hex)"
  RESTART_NEEDED=1
else
  echo "      ✓ Đã có AUDIT_CRON_SECRET"
fi

# ── 3. Đảm bảo có DATABASE_URL ──
echo ""
echo "[3/5] Kiểm tra DATABASE_URL trong .env..."
if ! grep -q "^DATABASE_URL=" "$ENV_FILE"; then
  echo ""
  echo "  ⚠ DATABASE_URL chưa có — lấy từ Supabase Dashboard:"
  echo ""
  echo "    1. https://supabase.com/dashboard/project/tmrtgriopaczpxrpxmpu/settings/database"
  echo "    2. Cuộn xuống mục 'Connection pooling' (KHÔNG dùng Direct connection ở free tier"
  echo "       vì Supabase chỉ cho IPv6, server công ty thường không có IPv6)"
  echo "    3. Mode: 'Session' (port 5432 — pg_dump cần Session, không dùng được Transaction)"
  echo "    4. Copy URI dạng:"
  echo "         postgresql://postgres.tmrtgriopaczpxrpxmpu:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres"
  echo "    5. Thay [YOUR-PASSWORD] bằng password DB thật"
  echo ""
  echo "  Lưu ý: nếu password có @ # & / : ? = + → URL-encode (vd @ → %40)"
  echo "  hoặc đổi password sang chỉ chữ + số."
  echo ""
  read -r -p "  Paste DATABASE_URL ở đây: " DB_URL
  if [ -z "$DB_URL" ]; then
    echo "      ✗ Trống — bỏ qua. Chạy lại script khi có DATABASE_URL."
    exit 1
  fi

  # Test connection trước khi save (tránh lưu URL sai)
  echo "      → Test connection..."
  if ! pg_isready -d "$DB_URL" -t 10 >/dev/null 2>&1; then
    echo "      ✗ Connect fail. Có thể:"
    echo "         (a) Đang dùng Direct connection 'db.xxx.supabase.co' — free tier chỉ IPv6,"
    echo "             server không có IPv6 → Đổi sang URL Pooler Session mode."
    echo "         (b) Password sai hoặc có ký tự đặc biệt chưa URL-encode."
    echo "         (c) Format URL sai (thiếu @ giữa password và host)."
    echo ""
    echo "      Verify nhanh:"
    echo "         host db.tmrtgriopaczpxrpxmpu.supabase.co   # nếu chỉ AAAA, không A → không IPv4"
    echo "         psql 'PASTE_DB_URL_HERE' -c 'select 1'    # test trực tiếp"
    echo ""
    echo "      Chạy lại script khi đã sửa."
    exit 1
  fi
  echo "      ✓ Connect OK"

  echo "DATABASE_URL=$DB_URL" >> "$ENV_FILE"
  echo "      ✓ Đã thêm DATABASE_URL"
  RESTART_NEEDED=1
else
  echo "      ✓ Đã có DATABASE_URL"
fi

# ── 4. Restart container nếu .env có thay đổi (để API đọc env mới) ──
echo ""
echo "[4/5] Restart Docker container để load env mới..."
if [ "${RESTART_NEEDED:-0}" = "1" ]; then
  if docker ps --format '{{.Names}}' | grep -q "^chamcong$"; then
    docker restart chamcong
    echo "      ✓ Restart container chamcong"
  else
    echo "      ! Không thấy container 'chamcong' đang chạy — bạn restart thủ công nếu cần."
  fi
else
  echo "      ✓ Không có thay đổi env, bỏ qua restart"
fi

# ── 5. Cài cron entry ──
echo ""
echo "[5/5] Cài cron 2:30 sáng..."
EXISTING_CRON=$(crontab -l 2>/dev/null || true)
if echo "$EXISTING_CRON" | grep -F "$APP_DIR/scripts/backup.sh" >/dev/null; then
  echo "      ✓ Cron đã có sẵn:"
  echo "        $(echo "$EXISTING_CRON" | grep -F "$APP_DIR/scripts/backup.sh")"
else
  (echo "$EXISTING_CRON"; echo "$CRON_LINE") | crontab -
  echo "      ✓ Đã thêm: $CRON_LINE"
fi

# Đảm bảo log file ghi được
sudo touch /var/log/chamcong-backup.log
sudo chown vmadmin:vmadmin /var/log/chamcong-backup.log

# ── Test ──
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Setup xong. Test backup ngay (~1-2 phút):"
echo "═══════════════════════════════════════════════════════"
read -r -p "  Chạy test backup luôn? [y/N]: " RUN_TEST
if [[ "${RUN_TEST,,}" == "y" ]]; then
  echo ""
  bash "$APP_DIR/scripts/backup.sh"
  echo ""
  echo "  Backup test xong. Xem file:"
  ls -lh "$APP_DIR/backups/" 2>/dev/null | head -10
else
  echo ""
  echo "  Chạy thủ công bất cứ lúc nào:"
  echo "    bash $APP_DIR/scripts/backup.sh"
fi

echo ""
echo "  Cron đã set 2:30 sáng hàng ngày. Log: /var/log/chamcong-backup.log"
echo "  Xem lần sau: tail -f /var/log/chamcong-backup.log"
echo ""
