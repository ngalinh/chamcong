"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROFIT_BRANDS } from "@/types/db";

export default function BrandMultiSelect({
  defaultValues = [],
}: {
  defaultValues?: string[];
}) {
  const [selected, setSelected] = useState<string[]>(defaultValues);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Sync khi defaultValues thay đổi (vd: mở edit form khác nhau)
  const defaultKey = defaultValues.join(",");
  useEffect(() => {
    setSelected(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultKey]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggle(brand: string) {
    setSelected((prev: string[]) =>
      prev.includes(brand) ? prev.filter((b: string) => b !== brand) : [...prev, brand]
    );
  }

  const label = selected.length === 0 ? "Chọn brand" : selected.join(", ");

  return (
    <div ref={ref} className="relative">
      {/* Hidden inputs để submit form */}
      {selected.map((b: string) => (
        <input key={b} type="hidden" name="brand" value={b} />
      ))}

      <button
        type="button"
        onClick={() => setOpen((o: boolean) => !o)}
        className={cn(
          "h-9 w-full rounded-lg border bg-white px-2.5 text-sm outline-none flex items-center justify-between gap-2 transition",
          open ? "border-neutral-900" : "border-neutral-200 hover:border-neutral-400",
          selected.length === 0 && "text-neutral-400",
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown size={14} className={cn("shrink-0 text-neutral-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-neutral-200 bg-white shadow-lg py-1">
          {PROFIT_BRANDS.map((b) => {
            const active = selected.includes(b);
            return (
              <button
                key={b}
                type="button"
                onClick={() => toggle(b)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-neutral-50 transition-colors",
                  active && "text-indigo-700 font-medium",
                )}
              >
                <span>{b}</span>
                {active && <Check size={13} className="text-indigo-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
