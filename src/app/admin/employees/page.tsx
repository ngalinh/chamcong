import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { Empty } from "@/components/ui/Empty";
import { Button } from "@/components/ui/Button";
import { Users, Check, CircleSlash, Trash2, Building2, Wifi } from "lucide-react";
import type { Employee, Office } from "@/types/db";
import EmployeeOfficeSelect from "@/components/EmployeeOfficeSelect";
import { ChangeEmployeePhoto } from "@/components/ChangeEmployeePhoto";

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

  const admin = createAdminClient();

  const { data: emp } = await admin
    .from("employees")
    .select("reference_photo")
    .eq("id", id)
    .maybeSingle();
  const { data: selfies } = await admin
    .from("check_ins")
    .select("selfie_path")
    .eq("employee_id", id);

  const { error } = await admin.from("employees").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (emp?.reference_photo) {
    await admin.storage.from("faces").remove([emp.reference_photo]);
  }
  const selfiePaths = (selfies ?? []).map((s) => s.selfie_path).filter(Boolean) as string[];
  if (selfiePaths.length) {
    await admin.storage.from("selfies").remove(selfiePaths);
  }

  revalidatePath("/admin/employees");
  revalidatePath("/admin");
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

export default async function EmployeesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();
  const [{ data: employees }, { data: offices }] = await Promise.all([
    admin.from("employees").select("*").order("created_at", { ascending: false }),
    admin.from("offices").select("*").eq("is_active", true).order("is_remote").order("name"),
  ]);

  const meEmail = user?.email ?? "";
  const officeMap = new Map<string, Office>(((offices as Office[]) ?? []).map((o) => [o.id, o]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nhân viên</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Nhân viên tự đăng ký khi đăng nhập lần đầu. Chi nhánh tự gán khi chấm công lần đầu — admin có thể chỉnh.
        </p>
      </div>

      {!employees?.length ? (
        <Empty
          icon={Users}
          title="Chưa có nhân viên"
          description="Nhân viên login Google đầu tiên sẽ tự xuất hiện ở đây."
        />
      ) : (
        <div className="rounded-2xl border border-white/60 glass overflow-hidden divide-y divide-neutral-200/60">
          {(employees as Employee[]).map((e) => {
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
                    <form action={deleteEmployee} className="shrink-0">
                      <input type="hidden" name="id" value={e.id} />
                      <Button size="sm" variant="danger" type="submit" title="Xoá tài khoản">
                        <Trash2 size={14} />
                      </Button>
                    </form>
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

                {/* Row 3: dropdown chi nhánh (flex-1) + nút đổi ảnh */}
                <div className="flex items-center gap-2">
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
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-neutral-500 max-w-2xl">
        💡 Nhân viên có chi nhánh <b>Làm online</b> sẽ chấm công không cần selfie/định vị, chỉ ghi nhận thời điểm.
        Xoá tài khoản sẽ xoá luôn <b>toàn bộ lịch sử check-in + ảnh selfie</b>.
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
