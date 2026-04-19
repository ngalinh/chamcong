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
    <div className="min-h-dvh flex flex-col bg-neutral-50">
      <AppHeader title="Chấm công" email={user.email} nav={nav} />
      <main className="flex-1 mx-auto max-w-6xl w-full px-safe py-4 pb-24 md:pb-8">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
