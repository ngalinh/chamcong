import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SelfEnrollForm from "@/components/SelfEnrollForm";
import { Fingerprint } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EnrollPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const admin = createAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("id, name, face_descriptor")
    .eq("email", user.email)
    .maybeSingle();

  // Đã enroll xong → về home, không cho vào lại
  if (employee?.face_descriptor) redirect("/");

  // Gợi ý tên từ Google user_metadata
  const defaultName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    employee?.name ??
    "";

  return (
    <main className="relative min-h-dvh flex items-center justify-center px-safe pt-safe pb-safe overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -left-40 h-80 w-80 rounded-full bg-indigo-400/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-purple-400/25 blur-3xl" />

      <div className="w-full max-w-md py-8">
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="relative">
            <div className="absolute -inset-3 rounded-[28px] bg-gradient-to-br from-indigo-400/40 to-purple-400/40 blur-2xl" />
            <div className="relative h-16 w-16 rounded-[20px] bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-700 shadow-xl shadow-indigo-500/40 flex items-center justify-center ring-1 ring-white/60">
              <Fingerprint size={28} className="text-white" strokeWidth={1.8} />
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Đăng ký lần đầu</h1>
            <p className="text-sm text-neutral-500 mt-1">Nhập tên và upload ảnh khuôn mặt để bắt đầu chấm công</p>
          </div>
        </div>

        <div className="glass rounded-3xl border border-white/60 shadow-xl shadow-neutral-900/5 p-6">
          <SelfEnrollForm email={user.email} defaultName={defaultName} />
        </div>
      </div>
    </main>
  );
}
