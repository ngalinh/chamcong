#!/bin/bash
# Backup nightly cho Chấm công.
#
# Làm 3 việc theo thứ tự:
#   1. pg_dump → /opt/chamcong/backups/db-YYYYMMDD-HHMMSS.sql.gz
#   2. Sync Storage buckets (selfies, faces) → /opt/chamcong/backups/storage/
#   3. Gọi /api/admin/cleanup-history để xoá data >300 ngày + selfie file
#   4. Rotate: xoá .sql.gz cũ hơn 30 ngày
#
# Cài đặt cron (crontab -e của user vmadmin):
#   30 2 * * * /opt/chamcong/scripts/backup.sh >> /var/log/chamcong-backup.log 2>&1
#
# Env required (đọc từ /opt/chamcong/.env):
#   DATABASE_URL                        — Postgres direct URL (Supabase Settings > Database)
#   NEXT_PUBLIC_SUPABASE_URL
#   SUPABASE_SERVICE_ROLE_KEY
#   AUDIT_CRON_SECRET                   — secret để gọi /api/admin/cleanup-history
#
# Optional:
#   BACKUP_DIR=/opt/chamcong/backups   (default)
#   BACKUP_RETENTION_DAYS=30           (default)
#   APP_URL=https://chamcong.basso.vn  (default)

set -euo pipefail

cd "$(dirname "$0")/.."

# Load env
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-/opt/chamcong/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
APP_URL="${APP_URL:-https://chamcong.basso.vn}"
TS=$(date +%Y%m%d-%H%M%S)
LOG_PREFIX="[$(date -Iseconds)]"

mkdir -p "$BACKUP_DIR" "$BACKUP_DIR/storage"

echo "$LOG_PREFIX === Backup chamcong start ==="

# 1. pg_dump
if [ -z "${DATABASE_URL:-}" ]; then
  echo "$LOG_PREFIX ERROR: DATABASE_URL chưa set trong .env. Lấy URI từ Supabase Settings > Database > Connection string"
  exit 1
fi

# Supabase chạy Postgres 17, Ubuntu apt chỉ có postgresql-client 16 → version
# mismatch. Dùng Docker postgres:17 để có pg_dump phiên bản tương thích.
PG_IMAGE="${PG_DUMP_IMAGE:-postgres:17}"
if ! command -v docker >/dev/null 2>&1; then
  echo "$LOG_PREFIX ERROR: docker không có. Cài Docker hoặc PostgreSQL client v17+."
  exit 1
fi

DB_FILE="$BACKUP_DIR/db-$TS.sql.gz"
echo "$LOG_PREFIX [1/4] pg_dump (qua $PG_IMAGE) → $DB_FILE"
# Pull image lần đầu (idempotent — không re-download nếu đã có)
docker image inspect "$PG_IMAGE" >/dev/null 2>&1 || docker pull "$PG_IMAGE" >/dev/null
docker run --rm -e PGCONNECT_TIMEOUT=15 "$PG_IMAGE" \
  pg_dump "$DATABASE_URL" --no-owner --no-privileges --clean --if-exists \
  | gzip -9 > "$DB_FILE"

# Kiểm tra dump không rỗng (dump fail -> file gzip ~20 byte chỉ chứa header)
DB_SIZE_BYTES=$(stat -c%s "$DB_FILE")
if [ "$DB_SIZE_BYTES" -lt 1024 ]; then
  echo "$LOG_PREFIX ERROR: dump quá nhỏ ($DB_SIZE_BYTES bytes) — pg_dump chắc fail."
  rm -f "$DB_FILE"
  exit 1
fi
DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
echo "$LOG_PREFIX       OK ($DB_SIZE)"

# 2. Storage sync (Node script — incremental)
echo "$LOG_PREFIX [2/4] Sync Supabase Storage → $BACKUP_DIR/storage/"
if ! command -v node >/dev/null 2>&1; then
  echo "$LOG_PREFIX WARN: node không có, bỏ qua storage sync. Cài node v20+ để dùng."
else
  node scripts/backup-storage.mjs --dest="$BACKUP_DIR/storage" --buckets=selfies,faces || {
    echo "$LOG_PREFIX WARN: storage sync có file fail (xem log trên)"
  }
fi

# 3. Cleanup data >300 ngày qua API (chạy SAU khi backup xong để không mất data)
echo "$LOG_PREFIX [3/4] Cleanup history >300 ngày qua $APP_URL/api/admin/cleanup-history"
if [ -z "${AUDIT_CRON_SECRET:-}" ]; then
  echo "$LOG_PREFIX WARN: AUDIT_CRON_SECRET chưa set, bỏ qua cleanup"
else
  CLEANUP_RES=$(curl -fsS -X POST "$APP_URL/api/admin/cleanup-history" \
    -H "X-Admin-Secret: $AUDIT_CRON_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"history_days":300,"log_days":30}' || echo '{"error":"curl failed"}')
  echo "$LOG_PREFIX       $CLEANUP_RES"
fi

# 4. Rotate: xoá .sql.gz cũ
echo "$LOG_PREFIX [4/4] Rotate file >$RETENTION_DAYS ngày"
DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -name "db-*.sql.gz" -mtime "+$RETENTION_DAYS" -print -delete | wc -l)
echo "$LOG_PREFIX       Xoá $DELETED file cũ"

# Tổng kết disk
TOTAL=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "$LOG_PREFIX === Backup xong. Tổng dung lượng $BACKUP_DIR: $TOTAL ==="
