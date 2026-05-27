import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/Button";
import { AlertTriangle, CheckCircle2, Plus, Pencil, Trash2, TrendingUp } from "lucide-react";
import type { ProfitChannel, ProfitRule, Employee } from "@/types/db";
import { PROFIT_CHANNELS, PROFIT_BRANDS, CUSTOMER_GROUPS, PROFIT_PCTS } from "@/types/db";
import {
  upsertProfitChannel,
  deleteProfitChannel,
  upsertProfitRule,
  deleteProfitRule,
} from "./actions";

function pctLabel(p: number) {
  return `${(p * 100).toFixed(1).replace(/\.0$/, "")}%`;
}
function pctNum(p: number) {
  return (p * 100).toFixed(1).replace(/\.0$/, "");
}

export async function ProfitTab({
  ok,
  error,
  editChannel,
  editRule,
}: {
  ok?: string;
  error?: string;
  editChannel?: string; // channel id đang edit
  editRule?: string;    // rule id đang edit
}) {
  const admin = createAdminClient();

  const [{ data: channels }, { data: rules }, { data: employees }] = await Promise.all([
    admin.from("profit_channels").select("*").order("created_at"),
    admin.from("profit_rules").select("*").order("channel_name").order("brand").order("customer_group"),
    admin.from("employees").select("id, name").eq("is_active", true).order("name"),
  ]);

  const channelList = (channels ?? []) as ProfitChannel[];
  const ruleList = (rules ?? []) as ProfitRule[];
  const empList = (employees ?? []) as Pick<Employee, "id" | "name">[];

  const editingChannel = editChannel ? channelList.find((c) => c.id === editChannel) : undefined;
  const editingRule = editRule ? ruleList.find((r) => r.id === editRule) : undefined;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Tính Profit</h2>
      </div>

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

      {/* ─── Bảng 1: Kênh NV → SALE / CSKH ─────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">
          Bảng 1 — Kênh NV / Tài khoản SALE / CSKH
        </h3>

        <div className="rounded-2xl border border-white/60 glass overflow-hidden">
          {channelList.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50/80 border-b border-neutral-200/60">
                  <tr>
                    <th className="text-left py-2.5 px-3 font-medium text-neutral-600 text-xs">Kênh NV</th>
                    <th className="text-left py-2.5 px-3 font-medium text-neutral-600 text-xs">Tài khoản SALE</th>
                    <th className="text-left py-2.5 px-3 font-medium text-neutral-600 text-xs">Tài khoản CSKH</th>
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
                          <td colSpan={4} className="px-3 py-3">
                            <ChannelForm channel={ch} employees={empList} action={upsertProfitChannel} />
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={ch.id}>
                        <td className="py-2.5 px-3 font-medium">{ch.channel_name}</td>
                        <td className="py-2.5 px-3 text-neutral-600">{saleEmp?.name ?? <span className="text-neutral-400">—</span>}</td>
                        <td className="py-2.5 px-3 text-neutral-600">{cskhEmp?.name ?? <span className="text-neutral-400">—</span>}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1 justify-end">
                            <a
                              href={`/admin/settings?tab=profit&edit_ch=${ch.id}`}
                              className="h-7 px-2 rounded-md border border-neutral-200 bg-white text-xs hover:bg-neutral-50 inline-flex items-center gap-1"
                            >
                              <Pencil size={11} /> Sửa
                            </a>
                            <form action={deleteProfitChannel} className="inline">
                              <input type="hidden" name="id" value={ch.id} />
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

          {/* Add new channel form */}
          {!editingChannel && (
            <div className="p-3 border-t border-neutral-200/40 bg-neutral-50/40">
              <p className="text-xs font-medium text-neutral-500 mb-2 flex items-center gap-1">
                <Plus size={12} /> Thêm kênh NV
              </p>
              <ChannelForm employees={empList} action={upsertProfitChannel} />
            </div>
          )}
        </div>
      </section>

      {/* ─── Bảng 2: Profit rules ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">
          Bảng 2 — % Profit theo Kênh / Brand / Nhóm KH
        </h3>

        <div className="rounded-2xl border border-white/60 glass overflow-hidden">
          {ruleList.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50/80 border-b border-neutral-200/60">
                  <tr>
                    <th className="text-left py-2.5 px-3 font-medium text-neutral-600 text-xs">Kênh NV</th>
                    <th className="text-left py-2.5 px-3 font-medium text-neutral-600 text-xs">Brand</th>
                    <th className="text-left py-2.5 px-3 font-medium text-neutral-600 text-xs">Nhóm KH</th>
                    <th className="text-right py-2.5 px-3 font-medium text-neutral-600 text-xs">% Profit</th>
                    <th className="text-right py-2.5 px-3 font-medium text-neutral-600 text-xs">% SALE</th>
                    <th className="text-right py-2.5 px-3 font-medium text-neutral-600 text-xs">% CSKH</th>
                    <th className="py-2.5 px-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/40">
                  {ruleList.map((r) => {
                    const isEditing = editingRule?.id === r.id;
                    if (isEditing) {
                      return (
                        <tr key={r.id} className="bg-indigo-50/40">
                          <td colSpan={7} className="px-3 py-3">
                            <RuleForm rule={r} action={upsertProfitRule} />
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={r.id}>
                        <td className="py-2.5 px-3 font-medium">{r.channel_name}</td>
                        <td className="py-2.5 px-3">{r.brand}</td>
                        <td className="py-2.5 px-3">{r.customer_group}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-indigo-700 font-medium">
                          {pctLabel(r.profit_pct)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-emerald-700">
                          {pctLabel(r.sale_pct)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-sky-700">
                          {pctLabel(r.cskh_pct)}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1 justify-end">
                            <a
                              href={`/admin/settings?tab=profit&edit_rule=${r.id}`}
                              className="h-7 px-2 rounded-md border border-neutral-200 bg-white text-xs hover:bg-neutral-50 inline-flex items-center gap-1"
                            >
                              <Pencil size={11} /> Sửa
                            </a>
                            <form action={deleteProfitRule} className="inline">
                              <input type="hidden" name="id" value={r.id} />
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

          {/* Add new rule form */}
          {!editingRule && (
            <div className="p-3 border-t border-neutral-200/40 bg-neutral-50/40">
              <p className="text-xs font-medium text-neutral-500 mb-2 flex items-center gap-1">
                <Plus size={12} /> Thêm rule profit
              </p>
              <RuleForm action={upsertProfitRule} />
            </div>
          )}
        </div>

        <p className="text-xs text-neutral-500 leading-relaxed">
          💡 <b>% SALE</b> + <b>% CSKH</b> là phần trăm của tổng profit dòng đó. Vd profit 6tr, SALE 70% = 4.2tr, CSKH 30% = 1.8tr.
        </p>
      </section>

      {/* Profit summary hiện tại */}
      <ProfitSummarySection channels={channelList} employees={empList} />
    </div>
  );
}

function ChannelForm({
  channel,
  employees,
  action,
}: {
  channel?: ProfitChannel;
  employees: Pick<Employee, "id" | "name">[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (fd: FormData) => any;
}) {
  return (
    <form action={action} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
      {channel && <input type="hidden" name="id" value={channel.id} />}

      <SelectField label="Kênh NV" name="channel_name" defaultValue={channel?.channel_name} disabled={!!channel}>
        {PROFIT_CHANNELS.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </SelectField>

      <SelectField label="Tài khoản SALE" name="sale_employee_id" defaultValue={channel?.sale_employee_id ?? ""}>
        <option value="">(chưa chọn)</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </SelectField>

      <SelectField label="Tài khoản CSKH" name="cskh_employee_id" defaultValue={channel?.cskh_employee_id ?? ""}>
        <option value="">(chưa chọn)</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </SelectField>

      <div className="flex gap-1.5">
        <Button type="submit" size="sm">{channel ? "Lưu" : "Thêm"}</Button>
        {channel && (
          <a
            href="/admin/settings?tab=profit"
            className="h-9 px-2.5 rounded-lg border border-neutral-200 bg-white text-xs font-medium hover:bg-neutral-50 inline-flex items-center"
          >
            Huỷ
          </a>
        )}
      </div>
    </form>
  );
}

function RuleForm({
  rule,
  action,
}: {
  rule?: ProfitRule;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (fd: FormData) => any;
}) {
  return (
    <form action={action} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_auto_auto_auto_auto] gap-2 items-end">
      {rule && <input type="hidden" name="id" value={rule.id} />}

      <SelectField label="Kênh NV" name="channel_name" defaultValue={rule?.channel_name} disabled={!!rule}>
        {PROFIT_CHANNELS.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </SelectField>

      <SelectField label="Brand" name="brand" defaultValue={rule?.brand} disabled={!!rule}>
        {PROFIT_BRANDS.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
      </SelectField>

      <SelectField label="Nhóm KH" name="customer_group" defaultValue={rule?.customer_group} disabled={!!rule}>
        {CUSTOMER_GROUPS.map((g) => (
          <option key={g} value={g}>{g}</option>
        ))}
      </SelectField>

      <SelectField label="% Profit" name="profit_pct" defaultValue={String(rule?.profit_pct ?? PROFIT_PCTS[0])}>
        {PROFIT_PCTS.map((p) => (
          <option key={p} value={String(p)}>{(p * 100).toFixed(1).replace(/\.0$/, "")}%</option>
        ))}
      </SelectField>

      <NumberPctField label="% SALE" name="sale_pct" defaultValue={rule ? Math.round(rule.sale_pct * 100) : 70} />
      <NumberPctField label="% CSKH" name="cskh_pct" defaultValue={rule ? Math.round(rule.cskh_pct * 100) : 30} />

      <div className="flex gap-1.5 col-span-2 sm:col-span-1">
        <Button type="submit" size="sm">{rule ? "Lưu" : "Thêm"}</Button>
        {rule && (
          <a
            href="/admin/settings?tab=profit"
            className="h-9 px-2.5 rounded-lg border border-neutral-200 bg-white text-xs font-medium hover:bg-neutral-50 inline-flex items-center"
          >
            Huỷ
          </a>
        )}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {channels.map((ch) => {
          const saleEmp = employees.find((e) => e.id === ch.sale_employee_id);
          const cskhEmp = employees.find((e) => e.id === ch.cskh_employee_id);
          return (
            <div key={ch.id} className="rounded-xl border border-white/60 glass p-3 space-y-1.5">
              <div className="font-semibold text-sm">{ch.channel_name}</div>
              <div className="text-xs text-neutral-600">
                <span className="text-emerald-600 font-medium">SALE:</span>{" "}
                {saleEmp?.name ?? <span className="text-neutral-400">chưa set</span>}
              </div>
              <div className="text-xs text-neutral-600">
                <span className="text-sky-600 font-medium">CSKH:</span>{" "}
                {cskhEmp?.name ?? <span className="text-neutral-400">chưa set</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
