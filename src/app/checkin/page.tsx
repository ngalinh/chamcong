import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import CheckInFlow from "@/components/CheckInFlow";
import RemoteCheckInFlow from "@/components/RemoteCheckInFlow";

export default async function CheckInPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: employee } = await supabase
    .from("employees")
    .select("id, name, face_descriptor, home_office_id")
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

  // Nếu nhân viên thuộc chi nhánh remote (Làm online) → flow đơn giản, không face/geo
  if (employee.home_office_id) {
    const { data: home } = await admin
      .from("offices")
      .select("id, name, is_remote, is_active")
      .eq("id", employee.home_office_id)
      .maybeSingle();
    if (home?.is_remote && home.is_active) {
      return (
        <RemoteCheckInFlow
          employeeName={employee.name}
          officeId={home.id}
          officeName={home.name}
        />
      );
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
