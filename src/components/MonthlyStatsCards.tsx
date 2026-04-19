"use client";

import { useEffect, useState } from "react";
import { Clock, Wifi, CalendarOff, X, Inbox, Check, AlertCircle } from "lucide-react";
import { LEAVE_CATEGORIES, type LeaveCategory, type LeaveStatus } from "@/types/db";
import { formatVN } from "@/lib/time";
import { cn } from "@/lib/utils";

export type LateItem = {
  id: string;
  at: string;
  office: string | null;
  minutes: number;
};

export type LeaveItem = {
  id: string;
  leave_date: string;
  category: LeaveCategory;
  duration: number;
  duration_unit: "day" | "hour";
  status: LeaveStatus;
};

type Stat = "late" | "online" | "off";

const TONE = {
  rose:   { iconBg: "bg-rose-50",   iconText: "text-rose-600",   valueText: "text-rose-700"   },
  indigo: { iconBg: "bg-indigo-50", iconText: "text-indigo-600", valueText: "text-indigo-700" },
  amber:  { iconBg: "bg-amber-50",  iconText: "text-amber-600",  valueText: "text-amber-700"  },
} as const;

export function MonthlyStatsCards({
  lateCount,
  onlineCount,
  offCount,
  lateItems,
  onlineItems,
  offItems,
}: {
  lateCount: number;
  onlineCount: number;
  offCount: number;
  lateItems: LateItem[];
  onlineItems: LeaveItem[];
  offItems: LeaveItem[];
}) {
  const [open, setOpen] = useState<Stat | null>(null);

  return (
    <>
      <div className="grid grid-cols-3 gap-2.5">
        <Card Icon={Clock}       label="Đi muộn"    value={lateCount}   tone="rose"   onClick={() => setOpen("late")} />
        <Card Icon={Wifi}        label="Làm online" value={onlineCount} tone="indigo" onClick={() => setOpen("online")} />
        <Card Icon={CalendarOff} label="Xin nghỉ"   value={offCount}    tone="amber"  onClick={() => setOpen("off")} />
      </div>

      {open && (
        <Sheet onClose={() => setOpen(null)} title={
          open === "late" ? "Lần đi muộn trong tháng" :
          open === "online" ? "Lần làm online trong tháng" :
          "Lần xin nghỉ trong tháng"
        }>
          {open === "late" && <LateList items={lateItems} />}
          {open === "online" && <LeaveList items={onlineItems} />}
          {open === "off" && <LeaveList items={offItems} />}
        </Sheet>
      )}
    </>
  );
}

function Card({
  Icon, label, value, tone, onClick,
}: {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  value: number;
  tone: keyof typeof TONE;
  onClick: () => void;
}) {
  const t = TONE[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl glass border border-white/60 p-3 text-left hover:bg-white/80 active:scale-[0.98] transition"
    >
      <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center mb-1.5", t.iconBg, t.iconText)}>
        <Icon size={14} strokeWidth={1.8} />
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 mb-0.5">
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("text-2xl font-semibold tabular-nums leading-none", t.valueText)}>{value}</div>
    </button>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Lock scroll khi sheet mở
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[80dvh] bg-white rounded-t-3xl shadow-2xl flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
          <h2 className="font-semibold text-base">{title}</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full hover:bg-neutral-100 flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 pb-safe pt-1 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}

function LateList({ items }: { items: LateItem[] }) {
  if (!items.length) return <Empty />;
  return (
    <div className="divide-y divide-neutral-200/70">
      {items.map((it) => (
        <div key={it.id} className="py-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <Clock size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Muộn {it.minutes} phút</div>
            <div className="text-xs text-neutral-500 truncate">
              {it.office ?? "—"} · {formatVN(it.at, "EEEE, d/M HH:mm")}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LeaveList({ items }: { items: LeaveItem[] }) {
  if (!items.length) return <Empty />;
  return (
    <div className="divide-y divide-neutral-200/70">
      {items.map((it) => (
        <div key={it.id} className="py-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <CalendarOff size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate flex items-center gap-1.5">
              {LEAVE_CATEGORIES[it.category]}
              <StatusBadge status={it.status} />
            </div>
            <div className="text-xs text-neutral-500">
              {formatVN(it.leave_date + "T00:00:00+07:00", "EEEE, d/M/yyyy")} · {it.duration} {it.duration_unit === "day" ? "ngày" : "giờ"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: LeaveStatus }) {
  const map = {
    pending:  { label: "Chờ",     cls: "bg-neutral-100 text-neutral-600" },
    approved: { label: "Duyệt",   cls: "bg-emerald-50 text-emerald-700"  },
    rejected: { label: "Từ chối", cls: "bg-rose-50 text-rose-700"        },
  }[status];
  return (
    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", map.cls)}>
      {map.label}
    </span>
  );
}

function Empty() {
  return (
    <div className="py-10 flex flex-col items-center gap-2 text-neutral-400">
      <Inbox size={28} />
      <p className="text-sm">Không có dữ liệu trong tháng</p>
    </div>
  );
}
