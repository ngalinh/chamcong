import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/Button";
import { AlertTriangle, CheckCircle2, Pencil, Trash2, TrendingUp } from "lucide-react";
import type { ProfitChannel, ProfitRule, Employee } from "@/types/db";
import { PROFIT_CHANNELS, PROFIT_BRANDS, CUSTOMER_GROUPS, PROFIT_PCTS } from "@/types/db";
import BrandMultiSelect from "./BrandMultiSelect";
import { ApplyFromSubmit } from "@/components/ApplyFromSubmit";
import {
  upsertProfitChannel,
  upsertProfitRule,
  upsertProfitRuleGroup,
  deleteProfitRuleGroup,
} from "./actions";

function pctLabel(p: number) {
  return `${(p * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

type RuleGroup = {
  channel_name: string;
  brands: string[];
  profit_pct: number;
  customer_groups: string[];
};

function groupRules(rules: ProfitRule[]): RuleGroup[] {
  // Group by channel + profit_pct + sorted customer_groups (brands can vary within a group)
  const map = new Map<string, RuleGroup>();
  // First pass: collect all customer_groups per channel+brand+pct, then group by channel+pct+cgs
  // Strategy: group rows that share the same channel, pct, AND the same set of customer_groups
  const tempMap = new Map<string, { channel_name: string; brand: string; profit_pct: number; customer_groups: string[] }>();
  for (const r of rules) {
    const key = `${r.channel_name}||${r.brand}||${r.profit_pct}`;
    if (!tempMap.has(key)) {
      tempMap.set(key, { channel_name: r.channel_name, brand: r.brand, profit_pct: r.profit_pct, customer_groups: [] });
    }
    tempMap.get(key)!.customer_groups.push(r.customer_group);
  }
  // Second pass: group by channel+pct+sorted_cgs, merge brands
  for (const g of tempMap.values()) {
    const sortedCgs = [...g.customer_groups].sort().join("~");
    const key = `${g.channel_name}||${g.profit_pct}||${sortedCgs}`;
    if (!map.has(key)) {
      map.set(key, { channel_name: g.channel_name, brands: [], profit_pct: g.profit_pct, customer_groups: g.customer_groups });
    }
    map.get(key)!.brands.push(g.brand);
  }
  return Array.from(map.values());
}

export async function ProfitTab({
  ok,
  error,
  editChannel,
  editRule,
}: {
  ok?: string;
  error?: string;
  editChannel?: string;
  editRule?: string; // encoded group key: channel_name||profit_pct||brands_tilde||cgs_tilde
}) {
  const admin = createAdminClient();

  const [{ data: channels }, { data: rules }, { data: employees }] = await Promise.all([
    admin.from("profit_channels").select("*").order("created_at"),
    admin.from("profit_rules").select("*").order("channel_name").order("brand").order("customer_group"),
    admin.from("employees").select("id, name").eq("is_active", true).order("name"),
  ]);

  const allChannels = (channels ?? []) as ProfitChannel[];
  const allRules = (rules ?? []) as ProfitRule[];
  const empList = (employees ?? []) as Pick<Employee, "id" | "name">[];

  // Tính tháng hiện tại và tháng sau
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;

  // Hiển thị chỉ rule hiệu lực tháng hiện tại (latest effective_from <= currentMonth)
  function latestEffective<T extends { effective_from: string }>(rows: T[], keyFn: (r: T) => string): T[] {
    const map = new Map<string, T>();
    for (const r of rows) {
      if (r.effective_from > currentMonth) continue;
      const key = keyFn(r);
      const ex = map.get(key);
      if (!ex || ex.effective_from < r.effective_from) map.set(key, r);
    }
    return Array.from(map.values());
  }

  const channelList = latestEffective(allChannels, (c) => c.channel_name);
  const ruleList = latestEffective(allRules, (r) => `${r.channel_name}||${r.brand}||${r.customer_group}`);

  const ruleGroups = groupRules(ruleList);

  const editingChannel = editChannel ? channelList.find((c) => c.id === editChannel) : undefined;
  const editGroupKey = editRule ? decodeURIComponent(editRule) : null;

  // Build edit key for a group: channel_name||profit_pct||brands_tilde||cgs_tilde
  function makeGroupKey(g: RuleGroup): string {
    return `${g.channel_name}||${g.profit_pct}||${[...g.brands].sort().join("~")}||${[...g.customer_groups].sort().join("~")}`;
  }

  return (
    <div className="space-y-8">

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-900 p-3 text-sm flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div><div className="font-medium">Lỗi</div><div className="text-xs mt-0.5">{error}</div></div>
        </div>
      )}
      {ok && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 p-3 text-sm flex items-center gap-2">
          <CheckCircle2 size={16} className="shrink-0" /> {ok}
        </div>
      )}

      {/* ─── Tài khoản nhân viên theo kênh ─────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">
          Tài khoản nhân viên theo kênh
        </h3>

        <div className="rounded-2xl border border-white/60 glass overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50/80 border-b border-neutral-200/60">
                <tr>
                  <th className="text-left py-2.5 px-3 font-medium text-neutral-600 text-xs">Kênh Sale</th>
                  <th className="text-left py-2.5 px-3 font-medium text-neutral-600 text-xs">Tài khoản SALE</th>
                  <th className="text-left py-2.5 px-3 font-medium text-neutral-600 text-xs">Tài khoản CSKH</th>
                  <th className="text-right py-2.5 px-3 font-medium text-neutral-600 text-xs">% SALE</th>
                  <th className="text-right py-2.5 px-3 font-medium text-neutral-600 text-xs">% CSKH</th>
                  <th className="py-2.5 px-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/40">
                {channelList.map((ch) => {
                  const isEditing = editingChannel?.id === ch.id;
                  const saleEmp = empList.find((e) => e.id === ch.sale_employee_id);
                  const cskhEmp = empList.find((e) => e.id === ch.cskh_employee_id);

                  if (isEditing) {
                    return (
                      <tr key={ch.id} className="bg-indigo-50/40">
                        <td colSpan={6} className="px-3 py-3">
                          <ChannelForm channel={ch} employees={empList} action={upsertProfitChannel} currentMonth={currentMonth} nextMonth={nextMonth} />
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={ch.id}>
                      <td className="py-2.5 px-3 font-medium">{ch.channel_name}</td>
                      <td className="py-2.5 px-3 text-neutral-600">{saleEmp?.name ?? <span className="text-neutral-400">—</span>}</td>
                      <td className="py-2.5 px-3 text-neutral-600">{cskhEmp?.name ?? <span className="text-neutral-400">—</span>}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-emerald-700 font-medium">
                        {ch.sale_pct > 0 ? pctLabel(ch.sale_pct) : <span className="text-neutral-400">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-sky-700 font-medium">
                        {ch.cskh_pct > 0 ? pctLabel(ch.cskh_pct) : <span className="text-neutral-400">—</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        <a
                          href={`/admin/settings?tab=profit&edit_ch=${ch.id}`}
                          className="h-7 px-2 rounded-md border border-neutral-200 bg-white text-xs hover:bg-neutral-50 inline-flex items-center gap-1"
                        >
                          <Pencil size={11} /> Sửa
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ─── Công thức profit ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">
          Công thức profit
        </h3>

        <div className="rounded-2xl border border-white/60 glass overflow-hidden">
          {ruleGroups.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50/80 border-b border-neutral-200/60">
                  <tr>
                    <th className="text-left py-2.5 px-3 font-medium text-neutral-600 text-xs">Kênh Sale</th>
                    <th className="text-left py-2.5 px-3 font-medium text-neutral-600 text-xs">Brand</th>
                    <th className="text-left py-2.5 px-3 font-medium text-neutral-600 text-xs">Nhóm KH</th>
                    <th className="text-right py-2.5 px-3 font-medium text-neutral-600 text-xs">% Profit</th>
                    <th className="py-2.5 px-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/40">
                  {ruleGroups.map((g) => {
                    const gKey = makeGroupKey(g);
                    const isEditing = editGroupKey === gKey;
                    if (isEditing) {
                      return (
                        <tr key={gKey} className="bg-indigo-50/40">
                          <td colSpan={5} className="px-3 py-3">
                            <RuleGroupForm group={g} action={upsertProfitRuleGroup} currentMonth={currentMonth} nextMonth={nextMonth} />
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={gKey}>
                        <td className="py-2.5 px-3 font-medium">{g.channel_name}</td>
                        <td className="py-2.5 px-3">{g.brands.join(", ")}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1">
                            {g.customer_groups.map((cg) => (
                              <span key={cg} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-neutral-100 text-neutral-700 text-xs font-medium">
                                {cg}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-indigo-700 font-medium">
                          {pctLabel(g.profit_pct)}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1 justify-end">
                            <a
                              href={`/admin/settings?tab=profit&edit_rule=${encodeURIComponent(gKey)}`}
                              className="h-7 px-2 rounded-md border border-neutral-200 bg-white text-xs hover:bg-neutral-50 inline-flex items-center gap-1"
                            >
                              <Pencil size={11} /> Sửa
                            </a>
                            <form action={deleteProfitRuleGroup} className="inline">
                              <input type="hidden" name="edit_key" value={gKey} />
                              <button
                                type="submit"
                                className="h-7 w-7 rounded-md border border-neutral-200 bg-white inline-flex items-center justify-center text-neutral-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
                              >
                                <Trash2 size={11} />
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>

        {!editGroupKey && (
          <div className="p-3 border border-neutral-200/40 rounded-2xl bg-neutral-50/40">
            <p className="text-xs font-medium text-neutral-500 mb-3">+ Thêm rule profit</p>
            <RuleForm action={upsertProfitRule} />
          </div>
        )}

        <p className="text-xs text-neutral-500 leading-relaxed">
          💡 <b>% SALE</b> và <b>% CSKH</b> cài chung theo Kênh Sale ở bảng trên.
          % Profit là phần trăm doanh thu được tính là profit, rồi nhân thêm % SALE/CSKH của kênh.
        </p>
      </section>

      <ProfitSummarySection channels={channelList} employees={empList} />
    </div>
  );
}

function ChannelForm({
  channel,
  employees,
  action,
  currentMonth,
  nextMonth,
}: {
  channel: ProfitChannel;
  employees: Pick<Employee, "id" | "name">[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (fd: FormData) => any;
  currentMonth: string;
  nextMonth: string;
}) {
  return (
    <form action={action} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-end">
      <input type="hidden" name="id" value={channel.id} />
      <input type="hidden" name="channel_name" value={channel.channel_name} />

      <SelectField label="Tài khoản SALE" name="sale_employee_id" defaultValue={channel.sale_employee_id ?? ""}>
        <option value="">(chưa chọn)</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </SelectField>

      <SelectField label="Tài khoản CSKH" name="cskh_employee_id" defaultValue={channel.cskh_employee_id ?? ""}>
        <option value="">(chưa chọn)</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </SelectField>

      <NumberPctField label="% SALE" name="sale_pct" defaultValue={Math.round(channel.sale_pct * 100)} />
      <NumberPctField label="% CSKH" name="cskh_pct" defaultValue={Math.round(channel.cskh_pct * 100)} />

      <div className="flex gap-1.5 col-span-2 sm:col-span-1">
        <ApplyFromSubmit currentMonth={currentMonth} nextMonth={nextMonth} />
        <a
          href="/admin/settings?tab=profit"
          className="h-9 px-2.5 rounded-lg border border-neutral-200 bg-white text-xs font-medium hover:bg-neutral-50 inline-flex items-center"
        >
          Huỷ
        </a>
      </div>
    </form>
  );
}

// Form để SỬA 1 group (channel, brands, profit_pct) với checkboxes cho Nhóm KH
function RuleGroupForm({
  group,
  action,
  currentMonth,
  nextMonth,
}: {
  group: RuleGroup;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (fd: FormData) => any;
  currentMonth: string;
  nextMonth: string;
}) {
  // edit_key: channel_name||profit_pct||brands_tilde||cgs_tilde
  const editKey = `${group.channel_name}||${group.profit_pct}||${[...group.brands].sort().join("~")}||${[...group.customer_groups].sort().join("~")}`;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="edit_key" value={editKey} />

      <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
        <SelectField label="Kênh Sale" name="_ch" defaultValue={group.channel_name} disabled>
          {PROFIT_CHANNELS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </SelectField>
        <label className="block text-sm">
          <div className="text-xs font-medium text-neutral-600 mb-1">Brand</div>
          <BrandMultiSelect defaultValues={group.brands} />
        </label>
        <SelectField label="% Profit" name="profit_pct" defaultValue={String(group.profit_pct)}>
          {PROFIT_PCTS.map((p) => (
            <option key={p} value={String(p)}>{(p * 100).toFixed(1).replace(/\.0$/, "")}%</option>
          ))}
        </SelectField>
        <div className="flex gap-1.5 col-span-2 sm:col-span-1">
          <ApplyFromSubmit currentMonth={currentMonth} nextMonth={nextMonth} />
          <a
            href="/admin/settings?tab=profit"
            className="h-9 px-2.5 rounded-lg border border-neutral-200 bg-white text-xs font-medium hover:bg-neutral-50 inline-flex items-center"
          >
            Huỷ
          </a>
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-neutral-600 mb-1.5">Nhóm KH</div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {CUSTOMER_GROUPS.map((g) => (
            <label key={g} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                name="customer_group"
                value={g}
                defaultChecked={group.customer_groups.includes(g)}
                className="h-4 w-4 rounded accent-neutral-900"
              />
              {g}
            </label>
          ))}
        </div>
      </div>
    </form>
  );
}

// Form để THÊM rule mới
function RuleForm({
  action,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (fd: FormData) => any;
}) {
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
        <SelectField label="Kênh Sale" name="channel_name">
          {PROFIT_CHANNELS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </SelectField>
        <label className="block text-sm">
          <div className="text-xs font-medium text-neutral-600 mb-1">Brand</div>
          <BrandMultiSelect />
        </label>
        <SelectField label="% Profit" name="profit_pct" defaultValue={String(PROFIT_PCTS[0])}>
          {PROFIT_PCTS.map((p) => (
            <option key={p} value={String(p)}>{(p * 100).toFixed(1).replace(/\.0$/, "")}%</option>
          ))}
        </SelectField>
        <div className="flex gap-1.5 col-span-2 sm:col-span-1">
          <Button type="submit" size="sm">Thêm</Button>
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-neutral-600 mb-1.5">Nhóm KH</div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {CUSTOMER_GROUPS.map((g) => (
            <label key={g} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                name="customer_group"
                value={g}
                defaultChecked
                className="h-4 w-4 rounded accent-neutral-900"
              />
              {g}
            </label>
          ))}
        </div>
      </div>
    </form>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  disabled,
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <div className="text-xs font-medium text-neutral-600 mb-1">{label}</div>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        disabled={disabled}
        className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-sm outline-none focus:border-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-500"
      >
        {children}
      </select>
    </label>
  );
}

function NumberPctField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: number;
}) {
  return (
    <label className="block text-sm">
      <div className="text-xs font-medium text-neutral-600 mb-1">{label}</div>
      <div className="relative">
        <input
          type="number"
          name={name}
          defaultValue={defaultValue}
          min={0}
          max={100}
          step={1}
          className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-2.5 pr-6 text-sm outline-none focus:border-neutral-900 tabular-nums"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400">%</span>
      </div>
    </label>
  );
}

function ProfitSummarySection({
  channels,
  employees,
}: {
  channels: ProfitChannel[];
  employees: Pick<Employee, "id" | "name">[];
}) {
  if (!channels.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide flex items-center gap-1.5">
        <TrendingUp size={14} /> Tóm tắt phân công
      </h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {channels.map((ch) => {
          const saleEmp = employees.find((e) => e.id === ch.sale_employee_id);
          const cskhEmp = employees.find((e) => e.id === ch.cskh_employee_id);
          return (
            <div key={ch.id} className="rounded-xl border border-white/60 glass p-3 space-y-1.5">
              <div className="font-semibold text-sm">{ch.channel_name}</div>
              <div className="text-xs text-neutral-600">
                <span className="text-emerald-600 font-medium">SALE:</span>{" "}
                {saleEmp?.name ?? <span className="text-neutral-400">chưa set</span>}
                {ch.sale_pct > 0 && <span className="text-neutral-400 ml-1">({pctLabel(ch.sale_pct)})</span>}
              </div>
              <div className="text-xs text-neutral-600">
                <span className="text-sky-600 font-medium">CSKH:</span>{" "}
                {cskhEmp?.name ?? <span className="text-neutral-400">chưa set</span>}
                {ch.cskh_pct > 0 && <span className="text-neutral-400 ml-1">({pctLabel(ch.cskh_pct)})</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
