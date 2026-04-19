"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fingerprint } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; exact?: boolean };

export function AppHeader({
  title,
  email,
  nav,
}: {
  title: string;
  email?: string;
  nav?: Item[];
}) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 glass border-b border-white/40 pt-safe">
      <div className="mx-auto max-w-6xl px-safe">
        <div className="h-14 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-700 flex items-center justify-center ring-1 ring-white/60 shadow-sm shadow-indigo-500/30">
              <Fingerprint size={14} className="text-white" strokeWidth={2.2} />
            </span>
            {title}
          </Link>
          {nav && (
            <nav className="hidden md:flex gap-1 text-sm ml-4">
              {nav.map((it) => {
                const active = it.exact
                  ? pathname === it.href
                  : pathname === it.href || pathname.startsWith(it.href + "/");
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={cn(
                      "rounded-lg px-3 py-1.5 font-medium transition",
                      active
                        ? "bg-neutral-900 text-white shadow-sm"
                        : "text-neutral-600 hover:text-neutral-900 hover:bg-white/60",
                    )}
                  >
                    {it.label}
                  </Link>
                );
              })}
            </nav>
          )}
          {email && (
            <div className="ml-auto text-xs text-neutral-500 truncate max-w-[180px]">{email}</div>
          )}
        </div>
      </div>
    </header>
  );
}
