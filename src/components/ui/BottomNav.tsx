"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, ListChecks, Building2, Fingerprint } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin",           label: "Tổng quan", icon: LayoutDashboard, match: (p: string) => p === "/admin" },
  { href: "/admin/employees", label: "Nhân viên", icon: Users,           match: (p: string) => p.startsWith("/admin/employees") },
  { href: "/checkin",         label: "Chấm công", icon: Fingerprint,     match: (p: string) => p.startsWith("/checkin"), highlight: true },
  { href: "/admin/history",   label: "Lịch sử",   icon: ListChecks,      match: (p: string) => p.startsWith("/admin/history") },
  { href: "/admin/settings",  label: "Chi nhánh", icon: Building2,       match: (p: string) => p.startsWith("/admin/settings") },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden sticky bottom-0 glass border-t border-white/40 pb-safe z-10">
      <ul className="grid grid-cols-5 px-1">
        {items.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 px-1 transition",
                  active ? "text-indigo-600" : "text-neutral-500",
                )}
              >
                {item.highlight ? (
                  <span className="flex items-center justify-center h-11 w-11 -mt-5 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-700 text-white shadow-lg shadow-indigo-500/40 ring-1 ring-white/60">
                    <Icon size={20} />
                  </span>
                ) : (
                  <Icon size={22} strokeWidth={active ? 2.3 : 1.8} />
                )}
                <span className="text-[10px] font-medium leading-tight">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
