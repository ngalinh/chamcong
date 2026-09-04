import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToAdmins } from "@/lib/push";
import { LEAVE_CATEGORIES } from "@/types/db";
import { timeToMinutes } from "@/lib/time";

export const runtime = "nodejs";

const TimeStr = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Giờ không hợp lệ");
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ");

const Schema = z.object({
  leave_dates: z.array(DateStr).min(1, "Vui lòng chọn ít nhất 1 ngày").max(31),
  category: z.enum([
    "online_rain",
    "online_wfh",
    "leave_hourly",
    "leave_paid",
  ]),
  duration: z.number().positive().max(30),
  duration_unit: z.enum(["day", "hour"]),
  start_time: TimeStr.nullable().optional(),
  end_time:   TimeStr.nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
}).refine(
  (d) => new Set(d.leave_dates).size === d.leave_dates.length,
  { message: "Các ngày bị trùng nhau" },
).refine(
  (d) => d.category !== "leave_hourly" || (d.start_time && d.end_time),
  { message: "Nghỉ theo giờ phải có thời gian bắt đầu + kết thúc" },
).refine(
  (d) => d.category !== "leave_hourly" || d.leave_dates.length === 1,
  { message: "Nghỉ theo giờ chỉ áp dụng cho 1 ngày" },
).refine(
  // WFH / trời mưa ca sáng/chiều = có start_time → ràng buộc 1 ngày + đủ 2 mốc
  (d) => !(["online_wfh", "online_rain"].includes(d.category) && d.start_time) || (d.end_time && d.leave_dates.length === 1),
  { message: "Làm online ca sáng/chiều cần đủ thời gian và chỉ áp dụng cho 1 ngày" },
).refine(
  // Nghỉ nửa ngày leave_paid = có start_time → 1 ngày + đủ 2 mốc + duration = 0.5
  (d) => !(d.category === "leave_paid" && d.start_time) || (d.end_time && d.leave_dates.length === 1 && d.duration === 0.5 && d.duration_unit === "day"),
  { message: "Nghỉ nửa ngày chỉ áp dụng cho 1 ngày + đúng 0.5 ngày phép" },
);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: emp } = await admin
    .from("employees")
    .select("id, name, email, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!emp || !emp.is_active)
    return NextResponse.json({ error: "Tài khoản không hợp lệ" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const data = parsed.data;

  // Một lần gửi nhiều ngày được tách thành một row cho mỗi leave_date ở dưới.
  // Vì vậy duration của nghỉ cả ngày phải là 1 trên TỪNG row, không phải tổng
  // số ngày do client gửi lên. Chuẩn hoá lại ở server để cả client/PWA cũ
  // (từng gửi duration = leave_dates.length) cũng không thể tạo dữ liệu N².
  const isFullDayRequest = data.duration_unit === "day"
    && !data.start_time
    && ["leave_paid", "online_wfh", "online_rain"].includes(data.category);
  const durationPerRow = isFullDayRequest ? 1 : data.duration;

  // Chặn trùng lặp: cùng NV + cùng category + cùng ngày + status pending hoặc approved
  // Riêng online_wfh: cho phép ca sáng + ca chiều trong cùng 1 ngày (chỉ chặn khi
  // trùng ca, hoặc 1 trong 2 là full_day).
  const { data: existing } = await admin
    .from("leave_requests")
    .select("leave_date, status, start_time, end_time")
    .eq("employee_id", emp.id)
    .eq("category", data.category)
    .in("leave_date", data.leave_dates)
    .in("status", ["pending", "approved"]);

  let conflicts = existing ?? [];
  if ((data.category === "online_wfh" || data.category === "online_rain") && conflicts.length > 0) {
    const newShift = data.start_time ? data.start_time.slice(0, 5) : null; // null = full_day
    conflicts = conflicts.filter((r) => {
      const existingShift = r.start_time ? (r.start_time as string).slice(0, 5) : null;
      // 1 trong 2 là full_day → conflict; cả 2 half-day → conflict khi trùng ca
      if (newShift === null || existingShift === null) return true;
      return newShift === existingShift;
    });
  } else if (data.category === "leave_hourly" && conflicts.length > 0) {
    // Cho phép nhiều đơn nghỉ giờ trong cùng 1 ngày — chỉ chặn khi trùng khung giờ
    const newStart = timeToMinutes(data.start_time!.slice(0, 5));
    const newEnd = timeToMinutes(data.end_time!.slice(0, 5));
    conflicts = conflicts.filter((r) => {
      if (!r.start_time || !r.end_time) return true;
      const existStart = timeToMinutes((r.start_time as string).slice(0, 5));
      const existEnd = timeToMinutes((r.end_time as string).slice(0, 5));
      // Trùng nếu newStart < existEnd AND existStart < newEnd
      return newStart < existEnd && existStart < newEnd;
    });
  }

  if (conflicts.length > 0) {
    const dupDates = [...new Set(conflicts.map((e) => e.leave_date as string))].sort();
    const formatted = dupDates
      .map((d) => {
        const [, m, day] = d.split("-");
        return `${Number(day)}/${Number(m)}`;
      })
      .join(", ");
    const hasApproved = conflicts.some((e) => e.status === "approved");
    const isHourlyConflict = data.category === "leave_hourly";
    const message = hasApproved
      ? isHourlyConflict
        ? `Bạn đã có đơn xin nghỉ giờ trùng khung giờ này ngày ${formatted} được duyệt rồi`
        : `Bạn đã có đơn xin nghỉ ngày ${formatted} được duyệt rồi`
      : isHourlyConflict
        ? `Bạn đã gửi đơn xin nghỉ giờ trùng khung giờ này ngày ${formatted} và đang chờ sếp duyệt`
        : `Bạn đã gửi đơn xin nghỉ ngày ${formatted} và đang chờ sếp duyệt`;
    return NextResponse.json({ error: message }, { status: 409 });
  }

  // Lưu start/end_time cho leave_hourly + online_wfh/online_rain half-day + leave_paid half-day
  // (dùng để shift effective work hours khi check-in / recalc late-early)
  const hasShiftTimes = data.category === "leave_hourly"
    || ((data.category === "online_wfh" || data.category === "online_rain" || data.category === "leave_paid") && !!data.start_time);
  const rows = data.leave_dates.map((d) => ({
    employee_id: emp.id,
    leave_date: d,
    category: data.category,
    duration: durationPerRow,
    duration_unit: data.duration_unit,
    start_time: hasShiftTimes ? data.start_time ?? null : null,
    end_time:   hasShiftTimes ? data.end_time   ?? null : null,
    reason: data.reason ?? null,
  }));

  const { error } = await admin.from("leave_requests").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Tự resolve alert missing_checkin nếu có (cho tất cả ngày)
  await admin
    .from("alerts")
    .update({ resolved: true })
    .eq("employee_id", emp.id)
    .in("alert_date", data.leave_dates)
    .eq("kind", "missing_checkin");

  // Push notification tới admin (fire-and-forget)
  const datesLabel = data.leave_dates.length === 1
    ? `ngày ${data.leave_dates[0]}`
    : `${data.leave_dates.length} ngày: ${data.leave_dates.join(", ")}`;
  sendPushToAdmins({
    title: "📋 Đơn xin nghỉ mới",
    body: `${emp.name}: ${LEAVE_CATEGORIES[data.category]} — ${datesLabel} (${durationPerRow} ${data.duration_unit === "day" ? "ngày" : "giờ"}${data.leave_dates.length > 1 ? "/ngày" : ""})`,
    url: "/admin/history?type=leave",
    tag: `leave-new-${emp.id}`,
  }).catch((e) => console.error("[push] admin notify failed", e));

  return NextResponse.json({ ok: true, count: rows.length });
}
