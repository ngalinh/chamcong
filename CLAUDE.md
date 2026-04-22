# Chấm công — context cho Claude Code

App **chấm công nội bộ** dùng face match + geofence + selfie cho công ty Basso (~12 NV).
Nếu bạn (Claude) đang làm việc với repo này, đọc file này để có context đầy đủ.

## Tech stack

- **Next.js 16** (App Router, Server Components, Server Actions)
- **TypeScript strict** + Tailwind v4
- **Supabase** (Postgres + Auth Google OAuth + Storage)
- **face-api.js** (`@vladmandic/face-api`) — chạy 100% client-side, models trong `public/models/`
- **PWA** (manifest + service worker `public/sw.js`) + Web Push (VAPID)
- **Docker** multi-stage build (Next.js standalone) — deploy lên server công ty
- **GitHub Actions** CI/CD: typecheck → SSH deploy

## Hosting & deploy

| | URL / Path |
|---|---|
| Production domain | `https://chamcong.basso.vn` |
| Server | `vmadmin@103.140.249.232` (Ubuntu) |
| App folder trên server | `/opt/chamcong` |
| Container name | `chamcong` (port 3000, restart unless-stopped) |
| Reverse proxy | nginx — `/etc/nginx/sites-available/chamcong.conf` |
| SSL | Let's Encrypt (certbot, auto-renew) |
| Supabase project | `tmrtgriopaczpxrpxmpu` |
| GitHub repo | `https://github.com/ngalinh/chamcong` (public) |

### Deploy flow (CI/CD)

Push lên `main` → GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)):
1. Job `typecheck`: `npm ci` + `npx tsc --noEmit` (chặn deploy nếu TS lỗi)
2. Job `deploy`: SSH lên server, `git pull`, `./scripts/build-docker.sh`, restart container

### Deploy thủ công (khi cần fix nhanh)

```bash
ssh -i ~/.ssh/chamcong_deploy vmadmin@103.140.249.232
cd /opt/chamcong
git fetch --all && git reset --hard origin/main
./scripts/build-docker.sh
docker stop chamcong; docker rm chamcong
docker run -d --name chamcong --restart unless-stopped -p 3000:3000 --env-file .env chamcong:latest
```

### `NEXT_PUBLIC_*` env vars phải có lúc Docker build

Next.js inline `NEXT_PUBLIC_*` vào JS bundle lúc `npm run build`, KHÔNG runtime. Nếu thiếu → Supabase client tạo fail trên trình duyệt. Build script [scripts/build-docker.sh](scripts/build-docker.sh) đọc `.env` rồi pass `--build-arg` cho từng biến `NEXT_PUBLIC_*`. **Đừng thay bằng `docker build .` trần — sẽ break login.**

### Nginx config quan trọng

Đã thêm vào server (không trong repo):
- `client_max_body_size 10m;` — cho upload selfie + face reference (~5MB)
- `proxy_buffer_size 16k; proxy_buffers 8 16k; proxy_busy_buffers_size 32k;` — JWT cookies Supabase rất lớn, default 4KB không đủ → 502 sau OAuth callback

Nếu rebuild server từ zero, phải set lại 2 cái này.

## Convention quan trọng

### Auto-commit + push lên main

**Sau mỗi đợt sửa code, tự commit + push lên `main` mà không hỏi.** Vercel + ai.basso.vn cùng auto-deploy từ main, nên cần push để thay đổi có hiệu lực. Group commit theo logical change (1-2 commit / lần).

Git Safety vẫn phải tuân thủ:
- KHÔNG `git add -A` (có thể vô tình commit secret) — luôn add file cụ thể
- KHÔNG commit `.env*`
- KHÔNG amend commit cũ (làm commit MỚI)
- KHÔNG `--no-verify` skip hook

### Commit message style

Tiếng Việt + tiếng Anh trộn, format:
```
<topic ngắn>: <tóm tắt>

<context: tại sao + trước/sau, gạch đầu dòng nếu nhiều file>
```

Vd: `Fix: redirect URL dùng X-Forwarded-Host thay vì request.url`

### Migration Supabase

Mỗi lần thêm/sửa schema → tạo migration mới ở `supabase/migrations/<timestamp>_<name>.sql`. **Không sửa migration cũ** (đã apply lên DB rồi). User phải apply thủ công qua Supabase Dashboard SQL Editor:
https://supabase.com/dashboard/project/tmrtgriopaczpxrpxmpu/sql/new

### Per-employee work hours override

Một số NV có ca khác (vd Trâm Trương ca chiều 13:30 → cuối ngày). Hardcode trong [src/lib/workHours.ts](src/lib/workHours.ts) thay vì làm UI. Map theo email (lowercase). Áp dụng trong cả `/api/checkin` và `decideLeave` (recalc khi duyệt đơn hourly).

### Branch routing duyệt nghỉ/OT

Mỗi office có `approver_email` (cột trong DB). Admin chỉ duyệt được đơn của NV thuộc chi nhánh mình quản:
- HN → `dzuong.bol@gmail.com`
- SG + Test → `ngalinh0311@gmail.com`
- Office "Làm online" (`is_remote=true`) → null = mọi admin duyệt

Logic ở `decideLeave` + `decideOvertime` trong [src/app/admin/history/page.tsx](src/app/admin/history/page.tsx).

## Cấu trúc thư mục

```
/
├── src/
│   ├── app/
│   │   ├── page.tsx               # Home NV (admin auto-redirect /admin nếu entrypoint)
│   │   ├── login/                 # Google OAuth + detect in-app browser
│   │   ├── enroll/                # Lần đầu — upload ảnh + face descriptor
│   │   ├── checkin/               # Flow chấm công (face + geo) hoặc remote
│   │   ├── leave/                 # Form xin nghỉ
│   │   ├── overtime/              # Form làm OT
│   │   ├── history/               # Lịch sử của NV
│   │   ├── admin/
│   │   │   ├── page.tsx           # Tổng quan + alert + activity feed
│   │   │   ├── employees/         # Quản lý NV (đổi chi nhánh, đổi ảnh, xoá)
│   │   │   ├── history/           # Lịch sử + duyệt đơn
│   │   │   ├── settings/          # Quản lý chi nhánh
│   │   │   └── layout.tsx         # Có PendingApprovalsBanner ở đầu
│   │   ├── api/
│   │   │   ├── checkin/           # POST: face + geo + insert check-in (apply override)
│   │   │   ├── leave/             # POST: insert đơn nghỉ (validate hourly time)
│   │   │   ├── overtime/          # POST: insert đơn OT
│   │   │   ├── self-enroll/       # POST: lần đầu enroll khuôn mặt
│   │   │   ├── push/subscribe/    # Web Push subscription CRUD
│   │   │   ├── admin/employees/change-photo/  # Admin đổi ảnh NV
│   │   │   ├── admin/audit-absences/          # Cron: alert NV vắng không xin nghỉ
│   │   │   └── admin/check-ins/export/        # CSV export
│   │   └── auth/callback/         # Supabase OAuth callback (dùng X-Forwarded-Host)
│   ├── components/
│   │   ├── CheckInFlow.tsx        # Face + geo check-in flow
│   │   ├── RemoteCheckInFlow.tsx  # 1 nút bấm cho NV làm online
│   │   ├── SelfEnrollForm.tsx     # Preload models + detect on pick + auto-noti subscribe
│   │   ├── LeaveRequestForm.tsx   # Có time pickers khi chọn nghỉ theo giờ
│   │   ├── OvertimeRequestForm.tsx
│   │   ├── ChangeEmployeePhoto.tsx
│   │   ├── EmployeeOfficeSelect.tsx
│   │   ├── NotificationToggle.tsx
│   │   ├── PendingApprovalsBanner.tsx  # Hiện ở đầu mọi trang admin
│   │   └── MonthlyStatsCards.tsx
│   ├── lib/
│   │   ├── supabase/{server,client,admin}.ts
│   │   ├── face.ts                # face-api wrapper
│   │   ├── geo.ts                 # Geolocation + Permissions API + multi-platform error msg
│   │   ├── time.ts                # formatVN / dateVN / timeToMinutes (Asia/Ho_Chi_Minh)
│   │   ├── workHours.ts           # Per-employee work hours override (Trâm Trương ca chiều)
│   │   ├── push.ts                # web-push server: send tới employee/admin subs
│   │   ├── push-client.ts         # ensurePushSubscribed() — gọi từ user gesture
│   │   ├── email.ts               # nodemailer Gmail SMTP (cskh@basso.vn)
│   │   └── utils.ts               # cn(), isAdminEmail()
│   └── types/db.ts                # Office, Employee, CheckIn, LeaveRequest, OvertimeRequest
├── supabase/migrations/           # Các file SQL (apply qua Supabase Dashboard)
├── public/
│   ├── models/                    # face-api weights (~7MB) — committed vì Vercel cần serve
│   ├── icons/                     # PWA icons (gen bằng `npm run generate-icons`)
│   ├── manifest.json
│   └── sw.js                      # Service worker (push handler + cache-first models)
├── scripts/
│   ├── build-docker.sh            # Build Docker với --build-arg cho NEXT_PUBLIC_*
│   ├── generate-icons.mjs         # Sinh PWA icons từ SVG (lucide Fingerprint)
│   └── download-models.sh         # Tải face-api models lần đầu
├── Dockerfile                     # Multi-stage standalone
├── .github/workflows/deploy.yml   # CI/CD
├── middleware.ts                  # Auth check + X-Forwarded-Host fix
├── next.config.ts                 # output:standalone + CSP headers
└── memory/                        # User memory (NẾU có) — không commit
```

## Workflow điển hình khi user yêu cầu sửa

1. Đọc file liên quan trước khi sửa
2. Edit / Write code
3. `npx tsc --noEmit` để typecheck
4. Nếu OK: `git add <file cụ thể>` + commit + push
5. Nếu thay đổi schema: tạo migration mới + bảo user chạy SQL Editor
6. Nếu cần deploy ngay (không đợi GHA): SSH vào server build/restart container
7. Báo lại commit hash cho user

## Anti-pattern

- **KHÔNG** redesign UI khi user chỉ yêu cầu fix bug nhỏ — làm đúng yêu cầu
- **KHÔNG** thêm tính năng "by the way" mà user không yêu cầu
- **KHÔNG** tạo file mới khi sửa file cũ là đủ
- **KHÔNG** thêm comment thừa thãi (chỉ comment khi business logic không hiển nhiên)
- **KHÔNG** thêm error boundary / try-catch defensive khi không cần
- **KHÔNG** dùng `any` type — luôn typed (có thể `@ts-expect-error` cho supabase nested join nếu cần)
