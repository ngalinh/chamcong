import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { Empty } from "@/components/ui/Empty";
import { Users, Check, CircleSlash, Building2, Wifi, CalendarOff, Trash2 } from "lucide-react";
import type { Employee, Office } from "@/types/db";
import EmployeeOfficeSelect from "@/components/EmployeeOfficeSelect";
import { ChangeEmployeePhoto } from "@/components/ChangeEmployeePhoto";
import { DeleteEmployeeButton } from "@/components/DeleteEmployeeButton";
import EmployeePayrollEditor from "@/components/EmployeePayrollEditor";
import EmployeeWorkHoursEditor from "@/components/EmployeeWorkHoursEditor";
import OtFixedSalaryEditor from "@/components/OtFixedSalaryEditor";

export const dynamic = "force-dynamic";

async function deleteEmployee(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("id, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const id = String(formData.get("id"));
  if (me?.id === id) throw new Error("Không thể tự xoá tài khoản của chính mình");

  // Soft delete: giữ row để history (check_ins, leave_requests, violations…) còn ref được.
  // Clear user_id để re-login Google không tự attach lại; clear face_descriptor để
  // không match được trên flow check-in nữa. Lịch sử + ảnh selfie giữ nguyên.
  const admin = createAdminClient();
  const { error } = await admin
    .from("employees")
    .update({
      is_active: false,
      user_id: null,
      face_descriptor: null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/employees");
  revalidatePath("/admin");
}

async function updateEmployeePayroll(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const id = String(formData.get("id"));
  const employmentType = String(formData.get("employment_type") ?? "fulltime");
  if (employmentType !== "fulltime" && employmentType !== "parttime")
    throw new Error("Loại nhân viên không hợp lệ");
  const salary = Number(formData.get("salary") ?? 0);
  const hourlyRate = Number(formData.get("hourly_rate") ?? 0);
  const overtimeRate = Number(formData.get("overtime_rate") ?? 0);
  if (!Number.isFinite(salary) || salary < 0) throw new Error("Lương không hợp lệ");
  if (!Number.isFinite(hourlyRate) || hourlyRate < 0) throw new Error("Lương theo giờ không hợp lệ");
  if (!Number.isFinite(overtimeRate) || overtimeRate < 0) throw new Error("Lương OT không hợp lệ");

  const admin = createAdminClient();
  const { error } = await admin
    .from("employees")
    .update({
      employment_type: employmentType,
      salary,
      hourly_rate: hourlyRate,
      overtime_rate: overtimeRate,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/employees");
}

async function updateOtFixedSalary(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const id = String(formData.get("id"));
  const raw = Number(formData.get("ot_fixed_salary") ?? 0);
  const val = Number.isFinite(raw) && raw >= 0 ? raw : 0;

  const admin = createAdminClient();
  const { error } = await admin
    .from("employees")
    .update({ ot_fixed_salary: val || null })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/employees");
}



async function addCompanyHoliday(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("id, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const date = String(formData.get("holiday_date") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Ngày không hợp lệ");

  const admin = createAdminClient();
  const { error } = await admin
    .from("company_holidays")
    .insert({ holiday_date: date, reason, created_by: me?.id ?? null });
  if (error && error.code !== "23505") throw new Error(error.message);

  // Invalidate snapshot tháng tương ứng để recompute
  const ym = date.slice(0, 7);
  await admin.from("payroll_snapshots").delete().eq("year_month", ym);

  revalidatePath("/admin/employees");
}

async function removeCompanyHoliday(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const id = String(formData.get("id") ?? "");
  const date = String(formData.get("holiday_date") ?? "");
  if (!id) throw new Error("Thiếu id");

  const admin = createAdminClient();
  const { error } = await admin.from("company_holidays").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const ym = date.slice(0, 7);
    await admin.from("payroll_snapshots").delete().eq("year_month", ym);
  }

  revalidatePath("/admin/employees");
}

async function updateEmployeeWorkHours(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const id = String(formData.get("id"));
  const shiftsJson = String(formData.get("work_shifts") ?? "[]");
  let shifts: { start: string; end: string }[];
  try {
    shifts = JSON.parse(shiftsJson);
    if (!Array.isArray(shifts)) throw new Error("not array");
  } catch {
    throw new Error("Dữ liệu ca làm không hợp lệ");
  }
  const TIME_RX = /^\d{2}:\d{2}(:\d{2})?$/;
  for (const s of shifts) {
    if (!s || typeof s !== "object" || !TIME_RX.test(s.start) || !TIME_RX.test(s.end)) {
      throw new Error("Giờ ca làm không hợp lệ");
    }
  }
  // Normalize HH:MM → HH:MM:SS, sort by start
  const normalized = shifts
    .map((s) => ({
      start: s.start.length === 5 ? `${s.start}:00` : s.start,
      end:   s.end.length   === 5 ? `${s.end}:00`   : s.end,
    }))
    .sort((a, b) => a.start.localeCompare(b.start));

  // Đồng thời sync work_start/end với first/last để legacy callers vẫn đọc đúng
  const updates: Record<string, unknown> = {
    work_shifts: normalized,
    work_start_time: normalized[0]?.start ?? null,
    work_end_time: normalized[normalized.length - 1]?.end ?? null,
  };

  const admin = createAdminClient();
  const { error } = await admin.from("employees").update(updates).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/employees");
}

async function updateEmployeeOffice(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const id = String(formData.get("id"));
  const officeIdRaw = String(formData.get("home_office_id") ?? "");
  const home_office_id = officeIdRaw === "" ? null : officeIdRaw;

  const admin = createAdminClient();
  const { error } = await admin
    .from("employees")
    .update({ home_office_id })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/employees");
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ holidays?: string }>;
}) {
  const sp = await searchParams;
  const showHolidays = sp.holidays === "open";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();
  const [{ data: employees }, { data: offices }] = await Promise.all([
    // Ẩn NV đã soft-delete (user_id null + is_active false). NV chưa login lần nào
    // (user_id null nhưng is_active vẫn true) hoặc bị khoá thường (is_active false
    // nhưng user_id còn) thì vẫn hiện.
    admin
      .from("employees")
      .select("*")
      .or("user_id.not.is.null,is_active.eq.true")
      .order("created_at", { ascending: false }),
    admin.from("offices").select("*").eq("is_active", true).order("is_remote").order("name"),
  ]);

  // Lấy ngày nghỉ chung từ đầu năm hiện tại trở đi (không hiện ngày quá khứ
  // năm cũ để list khỏi dài). Sort tăng dần.
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const { data: holidays } = await admin
    .from("company_holidays")
    .select("id, holiday_date, reason")
    .gte("holiday_date", yearStart)
    .order("holiday_date", { ascending: true });

  const meEmail = user?.email ?? "";
  const sortedEmployees = [...(employees ?? [])].sort((a, b) => {
    const aAdmin = a.is_admin ? 1 : 0;
    const bAdmin = b.is_admin ? 1 : 0;
    if (aAdmin !== bAdmin) return aAdmin - bAdmin;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const officeMap = new Map<string, Office>(((offices as Office[]) ?? []).map((o) => [o.id, o]));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nhân viên</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Nhân viên tự đăng ký khi đăng nhập lần đầu. Chi nhánh tự gán khi chấm công lần đầu — admin có thể chỉnh.
          </p>
        </div>
        <div className="relative flex items-center gap-2 flex-wrap">
          <Link
            href={showHolidays ? "/admin/employees" : "/admin/employees?holidays=open"}
            className="h-8 px-3 rounded-lg border border-neutral-200 bg-white text-xs font-medium hover:bg-neutral-50 inline-flex items-center gap-1.5 select-none"
            scroll={false}
          >
            <CalendarOff size={14} />
            Ngày nghỉ
            {(holidays?.length ?? 0) > 0 && (
              <span className="text-[10px] text-neutral-500 ml-1">({holidays?.length ?? 0})</span>
            )}
          </Link>
          {showHolidays && (
            <section className="absolute top-full right-0 mt-2 w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-neutral-200 bg-white shadow-xl p-3 z-20">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="text-xs font-semibold flex items-center gap-1.5">
                  <CalendarOff size={13} /> Ngày nghỉ chung công ty
                </h2>
                <Link
                  href="/admin/employees"
                  scroll={false}
                  className="text-xs text-neutral-500 hover:text-neutral-900"
                >
                  Đóng
                </Link>
              </div>
              <p className="text-[11px] text-neutral-500 mb-2 leading-snug">
                Áp cho mọi NV: không yêu cầu check-in, không tính vắng. NV vẫn nhận đủ lương tháng.
              </p>

              <form action={addCompanyHoliday} className="flex flex-col gap-1.5 mb-2">
                <input
                  type="date"
                  name="holiday_date"
                  required
                  className="h-8 w-full rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-900"
                />
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    name="reason"
                    placeholder="Lý do (tuỳ chọn)"
                    className="h-8 flex-1 min-w-0 rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-neutral-900"
                  />
                  <button
                    type="submit"
                    className="h-8 px-2.5 rounded-md bg-neutral-900 text-white text-xs font-medium hover:bg-neutral-800 shrink-0"
                  >
                    Thêm
                  </button>
                </div>
              </form>

              {(holidays ?? []).length === 0 ? (
                <p className="text-xs text-neutral-400 text-center py-2">Chưa có ngày nghỉ nào trong năm.</p>
              ) : (
                <ul className="max-h-60 overflow-y-auto rounded-md border border-neutral-200/60 divide-y divide-neutral-200/60 bg-white/60">
                  {(holidays ?? []).map((h) => (
                    <li key={h.id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                      <span className="font-mono tabular-nums text-neutral-700 w-20 shrink-0">
                        {h.holiday_date}
                      </span>
                      <span className="text-neutral-700 flex-1 truncate">
                        {h.reason ?? <span className="text-neutral-400">(chưa ghi lý do)</span>}
                      </span>
                      <form action={removeCompanyHoliday}>
                        <input type="hidden" name="id" value={h.id} />
                        <input type="hidden" name="holiday_date" value={h.holiday_date} />
                        <button
                          type="submit"
                          title="Xoá ngày này"
                          className="h-6 w-6 rounded-md text-neutral-400 hover:bg-rose-50 hover:text-rose-600 inline-flex items-center justify-center"
                        >
                          <Trash2 size={12} />
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>

      {!employees?.length ? (
        <Empty
          icon={Users}
          title="Chưa có nhân viên"
          description="Nhân viên login Google đầu tiên sẽ tự xuất hiện ở đây."
        />
      ) : (
        <div className="rounded-2xl border border-white/60 glass overflow-hidden divide-y divide-neutral-200/60">
          {(sortedEmployees as Employee[]).map((e) => {
            const office = e.home_office_id ? officeMap.get(e.home_office_id) : undefined;
            const canDelete = e.email !== meEmail;
            return (
              <div key={e.id} className="p-4 space-y-3">
                {/* Row 1: avatar + tên + email + delete */}
                <div className="flex items-start gap-3">
                  <Avatar name={e.name} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate flex items-center gap-1.5">
                      <span className="truncate">{e.name}</span>
                      {e.is_admin && (
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                          Admin
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500 truncate">{e.email}</div>
                  </div>
                  {canDelete && (
                    <div className="shrink-0">
                      <DeleteEmployeeButton
                        employeeId={e.id}
                        employeeName={e.name}
                        action={deleteEmployee}
                      />
                    </div>
                  )}
                </div>

                {/* Row 2: badges (chi nhánh / enroll / lock) */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={
                      office?.is_remote
                        ? "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-violet-50 text-violet-700"
                        : office
                        ? "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-sky-50 text-sky-700"
                        : "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-neutral-100 text-neutral-500"
                    }
                  >
                    {office?.is_remote ? <Wifi size={12} /> : <Building2 size={12} />}
                    {office?.name ?? "Chưa có chi nhánh"}
                  </span>
                  {e.face_descriptor ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-emerald-50 text-emerald-700">
                      <Check size={12} /> Đã enroll
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-amber-50 text-amber-700">
                      <CircleSlash size={12} /> Chưa enroll
                    </span>
                  )}
                  {!e.is_active && (
                    <span className="text-[11px] font-medium px-2 py-1 rounded-md bg-neutral-100 text-neutral-600">Khoá</span>
                  )}
                </div>

                {/* Row 3+4: chi nhánh + ảnh + loại NV + lương (cùng hàng trên màn rộng) */}
                <div className="flex gap-2 items-start flex-wrap">
                  <div className="flex items-center gap-2 flex-1 min-w-40">
                    <EmployeeOfficeSelect
                      employeeId={e.id}
                      currentOfficeId={e.home_office_id}
                      offices={((offices as Office[]) ?? []).map((o) => ({ id: o.id, name: o.name, is_remote: o.is_remote }))}
                      action={updateEmployeeOffice}
                    />
                    {e.face_descriptor && (
                      <ChangeEmployeePhoto employeeId={e.id} employeeName={e.name} />
                    )}
                  </div>
                  <div className="flex-1 min-w-52">
                    <EmployeePayrollEditor
                      employeeId={e.id}
                      initialEmploymentType={(e.employment_type ?? "fulltime") as "fulltime" | "parttime"}
                      initialSalary={Number(e.salary ?? 0)}
                      initialHourlyRate={Number(e.hourly_rate ?? 0)}
                      initialOvertimeRate={Number(e.overtime_rate ?? 0)}
                      action={updateEmployeePayroll}
                    />
                  </div>
                </div>

                {/* Row 5: lương OT cố định/tháng */}
                <OtFixedSalaryEditor
                  employeeId={e.id}
                  initialValue={e.ot_fixed_salary ?? null}
                  action={updateOtFixedSalary}
                />

                {/* Row 6: button "Thời gian làm việc" — click mới expand form,
                    có thể nhập nhiều ca (parttime online) hoặc chỉ 1 ca */}
                <EmployeeWorkHoursEditor
                  employeeId={e.id}
                  initialShifts={Array.isArray(e.work_shifts) ? (e.work_shifts as { start: string; end: string }[]) : []}
                  initialStart={e.work_start_time ?? null}
                  initialEnd={e.work_end_time ?? null}
                  officeStart={office?.work_start_time ?? null}
                  officeEnd={office?.work_end_time ?? null}
                  action={updateEmployeeWorkHours}
                />
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-neutral-500 max-w-2xl">
        💡 Nhân viên có chi nhánh <b>Làm online</b> sẽ chấm công không cần selfie/định vị, chỉ ghi nhận thời điểm.
        Xoá tài khoản sẽ <b>khoá</b> và ẩn NV khỏi danh sách, nhưng <b>lịch sử check-in vẫn được giữ</b> để admin tham chiếu.
      </p>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase() || "?";
  const hue = (name.charCodeAt(0) * 137) % 360;
  return (
    <div
      className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0"
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 60% 40%))`,
      }}
    >
      {initial}
    </div>
  );
}
