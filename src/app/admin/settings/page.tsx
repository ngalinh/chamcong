import Link from "next/link";
import { cn } from "@/lib/utils";
import { BranchesTab } from "./BranchesTab";
import { OrdersTab } from "./OrdersTab";
import { ProfitTab } from "./ProfitTab";
import { LogsTab } from "./LogsTab";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "orders",   label: "Đơn hàng" },
  { id: "profit",   label: "Tính Profit" },
  { id: "branches", label: "Chi nhánh" },
  { id: "logs",     label: "Log app" },
] as const;

type Tab = typeof TABS[number]["id"];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    // branches params
    error?: string; ok?: string; new?: string;
    // orders params
    preview?: string;
    ds_month?: string; // dropship revenue month
    // profit params
    edit_ch?: string; edit_rule?: string;
    // logs params
    level?: string;
  }>;
}) {
  const sp = await searchParams;
  const activeTab: Tab = (TABS.map((t) => t.id) as string[]).includes(sp.tab ?? "")
    ? (sp.tab as Tab)
    : "orders";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Cài đặt</h1>
      </div>

      {/* Tab nav */}
      <div className="flex items-center gap-1 border-b border-neutral-200/60">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin/settings?tab=${t.id}`}
            className={cn(
              "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
              activeTab === t.id
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Tab content */}
      <div className="pt-2">
        {activeTab === "orders" && (
          <OrdersTab ok={sp.ok} error={sp.error} preview={sp.preview} dsMonth={sp.ds_month} />
        )}
        {activeTab === "profit" && (
          <ProfitTab ok={sp.ok} error={sp.error} editChannel={sp.edit_ch} editRule={sp.edit_rule} />
        )}
        {activeTab === "branches" && (
          <BranchesTab ok={sp.ok} error={sp.error} showNew={sp.new === "1"} />
        )}
        {activeTab === "logs" && (
          <LogsTab level={sp.level} />
        )}
      </div>
    </div>
  );
}
