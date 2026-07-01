"use client";

import { useMemo, useState } from "react";

type Row = {
  sale_channel: string | null;
  brand: string | null;
  customer_group: string | null;
  total: number;
  profit_pct: number | null;
  profit: number | null;
  count: number;
};

function fmt(n: number) {
  return n.toLocaleString("vi-VN");
}

const CUSTOMER_GROUP_ORDER = ["Khách lẻ", "CTV", "Sỉ nhỏ", "Sỉ vừa", "Sỉ to"];

export function OrdersPreview({
  rows,
  monthLabel,
  filename,
}: {
  rows: Row[];
  monthLabel: string;
  filename: string;
}) {
  const [channel, setChannel] = useState("");
  const [brand, setBrand] = useState("");
  const [group, setGroup] = useState("");

  // Danh sách option cho từng bộ lọc (distinct, sort hợp lý)
  const channelOpts = useMemo(
    () => uniqSorted(rows.map((r) => r.sale_channel)),
    [rows]
  );
  const brandOpts = useMemo(
    () => uniqSorted(rows.map((r) => r.brand)),
    [rows]
  );
  const groupOpts = useMemo(() => {
    const set = uniqSorted(rows.map((r) => r.customer_group));
    return set.sort((a, b) => {
      const ai = CUSTOMER_GROUP_ORDER.indexOf(a);
      const bi = CUSTOMER_GROUP_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!channel || (r.sale_channel ?? "") === channel) &&
          (!brand || (r.brand ?? "") === brand) &&
          (!group || (r.customer_group ?? "") === group)
      ),
    [rows, channel, brand, group]
  );

  const totalAmount = filtered.reduce((s, r) => s + r.total, 0);
  const totalProfit = filtered.reduce((s, r) => s + (r.profit ?? 0), 0);
  const totalOrders = filtered.reduce((s, r) => s + r.count, 0);

  const hasFilter = !!(channel || brand || group);

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-medium text-sm text-indigo-900">
            Preview tháng {monthLabel} — {filename}
          </div>
          <div className="text-xs text-indigo-600 mt-0.5">
            {fmt(totalOrders)} đơn · Tổng doanh thu: {fmt(totalAmount)}đ · Tổng profit:{" "}
            <span className="text-emerald-700 font-medium">{fmt(totalProfit)}đ</span>
          </div>
        </div>
        <a
          href="/admin/settings?tab=orders"
          className="text-xs text-indigo-600 hover:text-indigo-800 underline shrink-0"
        >
          Đóng
        </a>
      </div>

      {/* Bộ lọc — text-xs ở container để nút "Xoá lọc" (globals.css ép button font:inherit) cũng 12px */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <FilterSelect label="Kênh NV" value={channel} onChange={setChannel} options={channelOpts} />
        <FilterSelect label="Brand" value={brand} onChange={setBrand} options={brandOpts} />
        <FilterSelect label="Nhóm KH" value={group} onChange={setGroup} options={groupOpts} />
        {hasFilter && (
          <button
            type="button"
            onClick={() => {
              setChannel("");
              setBrand("");
              setGroup("");
            }}
            className="text-xs text-indigo-600 hover:text-indigo-800 underline"
          >
            Xoá lọc
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-indigo-500">Không có dữ liệu</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-indigo-200">
                <th className="text-left py-1.5 px-2 font-medium text-indigo-700">Kênh NV</th>
                <th className="text-left py-1.5 px-2 font-medium text-indigo-700">Brand</th>
                <th className="text-left py-1.5 px-2 font-medium text-indigo-700">Nhóm KH</th>
                <th className="text-right py-1.5 px-2 font-medium text-indigo-700">Doanh thu (đ)</th>
                <th className="text-right py-1.5 px-2 font-medium text-indigo-700">% Profit</th>
                <th className="text-right py-1.5 px-2 font-medium text-indigo-700">Profit (đ)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i} className="border-b border-indigo-100 last:border-0">
                  <td className="py-1.5 px-2 text-neutral-700">{r.sale_channel ?? "(trống)"}</td>
                  <td className="py-1.5 px-2 text-neutral-700">{r.brand ?? "(trống)"}</td>
                  <td className="py-1.5 px-2 text-neutral-700">{r.customer_group ?? "(trống)"}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-medium">{fmt(r.total)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-neutral-500">
                    {r.profit_pct !== null ? `${(r.profit_pct * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-medium text-emerald-700">
                    {r.profit !== null ? fmt(r.profit) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-indigo-200">
                <td colSpan={3} className="py-1.5 px-2 font-semibold text-indigo-800">Tổng</td>
                <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-indigo-800">{fmt(totalAmount)}</td>
                <td />
                <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-emerald-700">{fmt(totalProfit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs">
      <span className="text-indigo-700 font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-lg border border-indigo-200 bg-white px-2 text-xs text-neutral-700 outline-none focus:border-indigo-500 max-w-[160px]"
      >
        <option value="">Tất cả</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "(trống)"}
          </option>
        ))}
      </select>
    </label>
  );
}

// Distinct + sort tiếng Việt; "" (trống) đẩy xuống cuối
function uniqSorted(vals: (string | null)[]): string[] {
  const set = new Set(vals.map((v) => v ?? ""));
  return Array.from(set).sort((a, b) => {
    if (a === "") return 1;
    if (b === "") return -1;
    return a.localeCompare(b, "vi");
  });
}
