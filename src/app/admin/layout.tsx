import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/utils";
import { AppHeader } from "@/components/ui/AppHeader";
import { BottomNav } from "@/components/ui/BottomNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: emp } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!emp?.is_admin && !isAdminEmail(user.email)) redirect("/");

  const nav = [
    { href: "/admin",           label: "Tổng quan", exact: true },
    { href: "/admin/employees", label: "Nhân viên" },
    { href: "/admin/history",   label: "Lịch sử"   },
    { href: "/admin/settings",  label: "Chi nhánh" },
  ];

  return (
    <div className="relative min-h-dvh flex flex-col overflow-x-hidden">
      {/* Ambient gradient blobs — đặt fixed để cuộn không bị mất */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-indigo-300/35 blur-3xl" />
        <div className="absolute top-1/3 -left-40 h-[26rem] w-[26rem] rounded-full bg-fuchsia-300/25 blur-3xl" />
        <div className="absolute -bottom-32 right-1/4 h-[24rem] w-[24rem] rounded-full bg-sky-300/20 blur-3xl" />
      </div>

      <AppHeader title="Chấm công" email={user.email} nav={nav} />
      <main className="flex-1 mx-auto max-w-6xl w-full px-safe py-4 pb-24 md:pb-8">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
