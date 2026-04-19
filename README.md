# Chấm công — PWA

PWA chấm công nhân viên với geofence + selfie + face match + liveness (chớp mắt).
Stack: Next.js 15, Supabase, face-api.js, Tailwind v4.

## Luồng chống gian lận

1. **Magic link login** qua email công ty (Supabase Auth) → chỉ nhân viên thật mới vào hệ thống.
2. **Geofence** — check-in chỉ được chấp nhận khi GPS nằm trong bán kính văn phòng (cấu hình ở `/admin/settings`). Server verify lại toạ độ từ client — không tin client.
3. **Liveness** — yêu cầu người chấm công chớp mắt trước camera (phát hiện qua EAR — eye aspect ratio). Chống dùng ảnh chụp sẵn.
4. **Face match** — so sánh descriptor 128-d từ selfie real-time với ảnh tham chiếu admin đã enroll. Nếu euclidean distance > threshold (default 0.5) → reject.
5. **Chặn trùng lặp** — không cho chấm công 2 lần trong 4 giờ.

> Muốn chặn 100% phải thêm **passkey binding** (device-level) — xem mục "Mở rộng" bên dưới.

## Setup local

### 1. Supabase

- Tạo project mới ở https://supabase.com/dashboard
- Copy `Project URL`, `anon key`, `service_role key` → `.env.local`
- Vào SQL Editor → chạy file `supabase/migrations/20260418000000_initial.sql`
- Vào Authentication → Email → bật **Enable Email Signups**, tắt **Confirm email** nếu muốn magic link 1 click
- (Optional) Authentication → URL Configuration → thêm redirect URL `http://localhost:3000/auth/callback` và domain production

### 2. Local env

```bash
cp .env.local.example .env.local
# sửa các giá trị bên trong
```

### 3. Cài deps + tải models face-api

```bash
npm install
npm run download-models   # ~6MB, lưu vào public/models/
```

### 4. Icons PWA (optional)

Đặt `icon-192.png` và `icon-512.png` vào `public/icons/` để cài được lên màn hình home. Có thể dùng bất kỳ tool nào (vd Figma export).

### 5. Chạy

```bash
npm run dev
```

Mở `https://localhost:3000` (cần HTTPS để camera + geolocation hoạt động — xem mục kế).

### 6. HTTPS cho dev (bắt buộc cho camera/GPS)

Next.js 15 có flag experimental:

```bash
npx next dev --experimental-https
```

Hoặc test qua điện thoại thật bằng `ngrok`:

```bash
ngrok http 3000
# copy HTTPS URL vào redirect URL trong Supabase Auth settings
```

## Luồng sử dụng

### Lần đầu — bootstrap admin

1. Thêm email của bạn vào `ADMIN_EMAILS` trong `.env.local`
2. Mở `/login`, nhập email đó → nhận magic link → click → hệ thống tự tạo row admin trong bảng `employees`
3. Vào `/admin` → `Cấu hình` → nhập lat/lng văn phòng

### Enroll nhân viên

1. `/admin/employees` → form trên cùng
2. Nhập email + họ tên + upload ảnh chân dung rõ mặt
3. Browser sẽ trích descriptor 128-d ngay trên client (không upload raw ảnh lên AI server nào), lưu vào DB
4. Nhân viên đăng nhập magic link → `/checkin` → flow chấm công

## Deploy (Vercel + Supabase)

1. Push repo lên GitHub
2. Import vào Vercel, thêm env vars (copy từ `.env.local`)
3. Vào Supabase → Auth → URL Configuration → thêm URL production vào **Redirect URLs**:
   - `https://your-domain.vercel.app/auth/callback`
4. Deploy

## Chi phí

- Supabase free tier: 500MB DB + 1GB storage + 50k MAU — đủ cho <100 nhân viên
- Vercel free tier: đủ cho traffic nội bộ
- Total: **0đ/tháng** cho team nhỏ

## Mở rộng (TODO phases tiếp theo)

- **Passkey/WebAuthn device binding** — để mỗi account chỉ chấm công từ 1 device. Dùng lib `@simplewebauthn/browser` + `@simplewebauthn/server`. Flow: sau magic link login đầu tiên, yêu cầu tạo passkey; các lần check-in sau bắt buộc verify passkey trước khi lên form.
- **WiFi SSID/BSSID check** — ngoài GPS. Browser không đọc được BSSID trực tiếp; cần một endpoint nội bộ trong mạng VP trả về token (vd `office.local:8080/token`) mà PWA phải fetch được trước khi chấm công.
- **Check-out + tính giờ làm** — thêm cột `type: 'in' | 'out'` vào `check_ins`, query GROUP BY ngày để tính tổng giờ.
- **Push notification** — nhắc nhân viên chấm công nếu đến giờ start mà chưa có check-in.
- **Face re-enroll** — cho nhân viên tự cập nhật ảnh sau khi cắt tóc / thay đổi ngoại hình, nhưng phải qua admin duyệt.
- **Audit log** — log mọi thao tác admin (enroll, deactivate, thay config) để minh bạch.

## Cấu trúc thư mục

```
src/
  app/
    login/              # Magic link form
    auth/callback/      # Magic link exchange
    checkin/            # Employee check-in flow
    admin/              # Admin dashboard (employees, check-ins, settings)
    api/                # Route handlers (checkin, admin/employees, export)
  components/
    CheckInFlow.tsx     # Core flow: geo → camera → liveness → match → upload
    EnrollEmployee.tsx  # Admin: chụp descriptor từ ảnh tham chiếu
  lib/
    supabase/           # Browser / server / service-role clients
    face.ts             # face-api wrappers + blink detector
    geo.ts              # Haversine + getCurrentPosition
    utils.ts            # Admin check, email domain check
supabase/migrations/    # SQL schema + RLS + storage buckets
public/models/          # face-api weights (tải bằng npm run download-models)
```

## Lưu ý pháp lý

Ảnh selfie và descriptor khuôn mặt là **dữ liệu sinh trắc học** theo Nghị định 13/2023/NĐ-CP. Bạn cần:

- Thông báo rõ cho nhân viên + lấy đồng ý bằng văn bản
- Giới hạn mục đích xử lý (chỉ chấm công, không dùng việc khác)
- Có cơ chế xoá dữ liệu khi nhân viên nghỉ việc
- Bảo mật storage (RLS đã bật, service role chỉ chạy server-side)
