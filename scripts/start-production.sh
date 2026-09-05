#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required to apply database migrations" >&2
  exit 1
fi

echo "Applying database migrations..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f /app/migrations/20260905020000_profit_total_shares.sql

exec node server.js
