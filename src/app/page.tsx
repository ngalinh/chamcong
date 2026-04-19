import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Fingerprint, LogOut, Shield, CheckCircle2, ArrowRight, CalendarOff, History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const admin = createAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("*")
    .eq("email", user.email)
    .maybeSingle();

  // Chưa enroll (hoặc chưa có ảnh) → ép qua /enroll
  if (!employee || !employee.face_descriptor) redirect("/enroll");

  const { data: lastCheckIn } = await admin
    .from("check_ins")
    .select("checked_in_at, offices(name)")
    .eq("employee_id", employee.id)
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isAdmin = isAdminEmail(user.email) || employee?.is_admin;
  const canCheckIn = true;
  // @ts-expect-error — supabase join
  const lastOfficeName: string | undefined = lastCheckIn?.offices?.name;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Chào buổi sáng" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";

  return (
    <main className="relative min-h-dvh flex flex-col px-safe pt-safe pb-safe overflow-hidden">
      {/* Ambient decoration */}
      <div className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-indigo-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-purple-300/20 blur-3xl" />

      <header className="relative flex items-center justify-between py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-neutral-400 font-medium">{greeting}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {employee?.name ?? user.email?.split("@")[0]}
          </h1>
        </div>
        <form action="/auth/signout" method="post">
          <button className="h-10 w-10 rounded-full glass border border-white/60 flex items-center justify-center text-neutral-500 hover:text-neutral-900">
            <LogOut size={18} />
          </button>
        </form>
      </header>

      <div className="relative flex-1 flex flex-col justify-center gap-6 max-w-md w-full mx-auto py-8">
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/leave"
            className="rounded-2xl glass border border-white/60 p-4 hover:bg-white/80 transition"
          >
            <div className="h-11 w-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-2">
              <CalendarOff size={20} strokeWidth={1.8} />
            </div>
            <p className="font-medium">Xin nghỉ</p>
            <p className="text-xs text-neutral-500">WFH, trừ phép…</p>
          </Link>
          <Link
            href="/history"
            className="rounded-2xl glass border border-white/60 p-4 hover:bg-white/80 transition"
          >
            <div className="h-11 w-11 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mb-2">
              <History size={20} strokeWidth={1.8} />
            </div>
            <p className="font-medium">Lịch sử</p>
            <p className="text-xs text-neutral-500">Chấm công, xin nghỉ</p>
          </Link>
        </div>

        {canCheckIn && (
          <Link href="/checkin" className="group block">
            <div className="relative aspect-square w-full rounded-[36px] overflow-hidden shadow-2xl shadow-indigo-500/40 transition group-active:scale-[0.98]">
              {/* Gradient fill */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-800" />
              {/* Glass pattern highlights */}
              <div className="absolute -top-24 -right-10 h-64 w-64 rounded-full bg-white/15 blur-2xl" />
              <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-fuchsia-300/20 blur-3xl" />
              {/* Ring decoration */}
              <div className="absolute inset-8 rounded-full border border-white/20" />
              <div className="absolute inset-16 rounded-full border border-white/10" />

              <div className="relative h-full flex flex-col items-center justify-center gap-4 text-white">
                <div className="h-20 w-20 rounded-full bg-white/15 backdrop-blur ring-1 ring-white/30 flex items-center justify-center">
                  <Fingerprint size={40} strokeWidth={1.5} />
                </div>
                <div className="text-center">
                  <p className="text-2xl font-semibold tracking-tight">Chấm công ngay</p>
                  <p className="text-sm text-white/70 mt-0.5">Chạm để bắt đầu</p>
                </div>
              </div>
            </div>
          </Link>
        )}

        {lastCheckIn && (
          <div className="rounded-2xl glass border border-white/60 shadow-sm p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shrink-0 shadow-sm shadow-emerald-500/30">
              <CheckCircle2 size={20} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-neutral-500">Chấm công gần nhất</p>
              <p className="text-sm font-medium truncate">
                {lastOfficeName ?? "—"} ·{" "}
                {formatDistanceToNow(new Date(lastCheckIn.checked_in_at), {
                  addSuffix: true,
                  locale: vi,
                })}
              </p>
            </div>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="relative py-6 max-w-md w-full mx-auto">
          <Link href="/admin">
            <Button variant="secondary" size="lg" className="w-full bg-white/70 backdrop-blur">
              <Shield size={18} /> Vào trang quản trị
              <ArrowRight size={16} className="ml-auto" />
            </Button>
          </Link>
        </div>
      )}
    </main>
  );
}

