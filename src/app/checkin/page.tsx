import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import CheckInFlow from "@/components/CheckInFlow";
import RemoteCheckInFlow from "@/components/RemoteCheckInFlow";
import { currentTimeVN, dateVN, timeToMinutes } from "@/lib/time";
import { resolveCheckinMode, vnDayOfWeek } from "@/lib/onlineCheckin";

export default async function CheckInPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: employee } = await supabase
    .from("employees")
    .select("id, name, face_descriptor, home_office_id, email, work_start_time, work_end_time, work_shifts")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!employee) {
    return (
      <main className="mx-auto max-w-md p-6">
        <p>Tài khoản chưa được enroll. Liên hệ admin.</p>
      </main>
    );
  }

  const admin = createAdminClient();

  // Chi nhánh gốc của NV — quyết định chấm online (remote / đơn online / sáng T7 SG).
  if (employee.home_office_id) {
    const { data: home } = await admin
      .from("offices")
      .select("id, name, is_remote, is_active, work_start_time, work_end_time")
      .eq("id", employee.home_office_id)
      .maybeSingle();

    if (home?.is_active) {
      const dayStr = dateVN(new Date());
      const [{ data: onlineLeaves }, { data: lastCi }] = await Promise.all([
        admin
          .from("leave_requests")
          .select("category, start_time, end_time")
          .eq("employee_id", employee.id)
          .eq("leave_date", dayStr)
          .like("category", "online_%"),
        admin
          .from("check_ins")
          .select("kind, checked_in_at")
          .eq("employee_id", employee.id)
          .order("checked_in_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const elapsedMin = lastCi
        ? (Date.now() - new Date(lastCi.checked_in_at as string).getTime()) / 60000
        : Infinity;
      const kind: "in" | "out" =
        lastCi?.kind === "in" && elapsedMin < 18 * 60 ? "out" : "in";

      const mode = resolveCheckinMode({
        emp: {
          email: employee.email,
          work_start_time: employee.work_start_time,
          work_end_time: employee.work_end_time,
          work_shifts: (employee.work_shifts ?? null) as Array<{ start: string; end: string }> | null,
        },
        officeName: home.name,
        officeStart: home.work_start_time,
        officeEnd: home.work_end_time,
        isRemoteOffice: !!home.is_remote,
        onlineLeaves: onlineLeaves ?? [],
        isSaturday: vnDayOfWeek() === 6,
        nowMin: timeToMinutes(currentTimeVN()),
        kind,
      });

      if (mode.online) {
        return (
          <RemoteCheckInFlow
            employeeName={employee.name}
            officeId={home.id}
            officeName={home.name}
          />
        );
      }
    }
  }

  if (!employee.face_descriptor) {
    return (
      <main className="mx-auto max-w-md p-6">
        <p>Bạn chưa có ảnh tham chiếu. Liên hệ admin để enroll khuôn mặt.</p>
      </main>
    );
  }

  // Lấy danh sách chi nhánh thật (loại trừ remote) để client nhận diện vị trí
  const { data: offices } = await admin
    .from("offices")
    .select("id, name, latitude, longitude, radius_m")
    .eq("is_active", true)
    .eq("is_remote", false);

  const threshold = Number(process.env.NEXT_PUBLIC_FACE_MATCH_THRESHOLD ?? 0.5);

  return (
    <CheckInFlow
      employeeId={employee.id}
      employeeName={employee.name}
      referenceDescriptor={employee.face_descriptor as number[]}
      offices={offices ?? []}
      threshold={threshold}
    />
  );
}
