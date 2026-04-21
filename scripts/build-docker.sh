#!/usr/bin/env bash
# Build Docker image với NEXT_PUBLIC_* env vars truyền qua --build-arg.
# Dùng cho cả local test lẫn production deploy.
#
# Usage:
#   ./scripts/build-docker.sh            # đọc từ .env (production-style)
#   ENV_FILE=.env.local ./scripts/build-docker.sh   # đọc từ .env.local
#
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"
IMAGE="${IMAGE:-chamcong:latest}"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Không thấy $ENV_FILE" >&2
  exit 1
fi

echo "→ Load env từ $ENV_FILE"
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

# Verify các biến bắt buộc
for var in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY; do
  if [ -z "${!var:-}" ]; then
    echo "❌ Thiếu $var trong $ENV_FILE" >&2
    exit 1
  fi
done

echo "→ Build $IMAGE"
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY \
  --build-arg NEXT_PUBLIC_VAPID_PUBLIC_KEY \
  --build-arg NEXT_PUBLIC_FACE_MATCH_THRESHOLD \
  -t "$IMAGE" .

echo "✓ Build xong: $IMAGE"
