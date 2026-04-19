import { createAdminClient } from "@/lib/supabase/admin";
import EnrollEmployee from "@/components/EnrollEmployee";
import { Empty } from "@/components/ui/Empty";
import { Users, Check, CircleSlash } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const admin = createAdminClient();
  const { data: employees } = await admin
    .from("employees")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nhân viên</h1>

      <EnrollEmployee />

      {!employees?.length ? (
        <Empty icon={Users} title="Chưa có nhân viên" description="Thêm nhân viên đầu tiên qua form trên." />
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden divide-y divide-neutral-100">
          {employees.map((e) => (
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase() || "?";
  const hue = (name.charCodeAt(0) * 137) % 360;
  return (
    <div
      className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0"
      style={{ backgroundColor: `hsl(${hue} 55% 50%)` }}
    >
      {initial}
    </div>
  );
}
