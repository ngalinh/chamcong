import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { Empty } from "@/components/ui/Empty";
import { Button } from "@/components/ui/Button";
import { Users, Check, CircleSlash, Trash2 } from "lucide-react";
import type { Employee } from "@/types/db";

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

  // Lấy selfie paths + reference_photo để xoá storage trước khi xoá DB row
  const { data: emp } = await admin
    .from("employees")
    .select("reference_photo")
    .eq("id", id)
    .maybeSingle();
  const { data: selfies } = await admin
    .from("check_ins")
    .select("selfie_path")
    .eq("employee_id", id);

  // Delete row — check_ins cascade tự động (FK ON DELETE CASCADE)
  const { error } = await admin.from("employees").delete().eq("id", id);
  if (error) throw new Error(error.message);

  // Cleanup storage (fire-and-forget)
  if (emp?.reference_photo) {
    await admin.storage.from("faces").remove([emp.reference_photo]);
  }
  const selfiePaths = (selfies ?? []).map((s) => s.selfie_path).filter(Boolean);
  if (selfiePaths.length) {
    await admin.storage.from("selfies").remove(selfiePaths);
  }

  revalidatePath("/admin/employees");
  revalidatePath("/admin");
}

export default async function EmployeesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();
  const { data: employees } = await admin
    .from("employees")
    .select("*")
    .order("created_at", { ascending: false });

  const meEmail = user?.email ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nhân viên</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Nhân viên tự đăng ký khi đăng nhập lần đầu. Admin chỉ xem và xoá.
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
          {(employees as Employee[]).map((e) => (
            <div key={e.id} className="p-4 flex items-center gap-3">
              <Avatar name={e.name} />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{e.name}</div>
                <div className="text-xs text-neutral-500 truncate">{e.email}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {e.is_admin && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                    Admin
                  </span>
                )}
                {e.face_descriptor ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                    <Check size={11} /> Enroll
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                    <CircleSlash size={11} /> Chưa
                  </span>
                )}
                {!e.is_active && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">Khoá</span>
                )}
              </div>
              {e.email !== meEmail && (
                <form action={deleteEmployee}>
                  <input type="hidden" name="id" value={e.id} />
                  <Button size="sm" variant="danger" type="submit" title="Xoá tài khoản">
                    <Trash2 size={14} />
                  </Button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-neutral-500 max-w-2xl">
        💡 Xoá tài khoản sẽ xoá luôn <b>toàn bộ lịch sử check-in + ảnh selfie</b> của nhân viên đó.
        Lần sau họ login Google → buộc enroll lại.
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
