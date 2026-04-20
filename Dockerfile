# syntax=docker/dockerfile:1.6
# ============================================================
# Multi-stage Dockerfile cho Next.js (output: standalone)
# Image cuối cỡ ~180 MB, chạy trên port 3000
# ============================================================

# ----- Stage 1: deps — chỉ cài node_modules (cache layer) -----
FROM node:22-alpine AS deps
WORKDIR /app

# Alpine cần libc6-compat cho 1 số binary native (sharp, face-api models loader)
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund


# ----- Stage 2: builder — build Next.js -----
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Skip telemetry để build nhanh hơn
ENV NEXT_TELEMETRY_DISABLED=1

# Build sẽ tạo .next/standalone/ + .next/static/
RUN npm run build


# ----- Stage 3: runner — production image siêu gọn -----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Tạo user non-root cho security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy standalone server (đã include node_modules cần thiết)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Copy static assets (CSS, JS chunks, fonts)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copy public/ (face-api models, manifest, icons, sw.js)
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

# server.js do Next.js tự sinh trong .next/standalone/
CMD ["node", "server.js"]
