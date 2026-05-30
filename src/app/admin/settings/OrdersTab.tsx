import { createAdminClient } from "@/lib/supabase/admin";
import { Empty } from "@/components/ui/Empty";
import { Button } from "@/components/ui/Button";
import { NumberInput } from "@/components/NumberInput";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Trash2, Eye, Upload, PackageSearch } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import type { OrderFile, ProfitRule } from "@/types/db";
import { PROFIT_CHANNELS, CUSTOMER_GROUPS } from "@/types/db";
import { resolveChannelName } from "@/lib/channelAlias";

type DropshipEntry = { amount: number };
import { uploadOrderFile, deleteOrderFile, upsertDropshipRevenue } from "./actions";

function fmt(n: number) {
  return n.toLocaleString("vi-VN");
}

export async function OrdersTab({
  ok,
  error,
  preview,
  dsMonth,
}: {
  ok?: string;
  error?: string;
  preview?: string; // YYYY-MM — tháng đang preview
  dsMonth?: string; // YYYY-MM — tháng đang nhập dropship revenue
}) {
  const admin = createAdminClient();

  const { data: files } = await admin
    .from("order_files")
    .select("*")
    .order("month", { ascending: false });

  // Nếu đang preview tháng nào, lấy summary data
  let summaryRows: { sale_channel: string | null; brand: string | null; customer_group: string | null; total: number; profit_pct: number | null; profit: number | null }[] = [];
  let totalAmount = 0;
  let totalOrders = 0;
  let previewFile: OrderFile | null = null;

  const customerGroupOrder = ["Khách lẻ", "CTV", "Sỉ nhỏ", "Sỉ vừa", "Sỉ to"];

  if (preview) {
    previewFile = ((files ?? []) as OrderFile[]).find((f) => f.month === preview) ?? null;
    if (previewFile) {
      // Fetch tất cả rows theo batch (Supabase PostgREST max 1000/request)
      const BATCH = 1000;
      const allRows: { sale_channel: string | null; brand: string | null; customer_group: string | null; amount: number }[] = [];
      for (let from = 0; ; from += BATCH) {
        const { data: batch } = await admin
          .from("order_data")
          .select("sale_channel, brand, customer_group, amount")
          .eq("file_id", previewFile.id)
          .range(from, from + BATCH - 1);
        if (!batch || batch.length === 0) break;
        allRows.push(...batch);
        if (batch.length < BATCH) break;
      }

      totalOrders = allRows.length;

      // Fetch profit rules
      const { data: profitRules } = await admin.from("profit_rules").select("*");
      const ruleMap = new Map<string, number>(
        ((profitRules ?? []) as ProfitRule[]).map((r) => [
          `${r.channel_name}||${r.brand}||${r.customer_group}`,
          r.profit_pct,
        ])
      );

      // Group by sale_channel + brand + customer_group
      const map = new Map<string, number>();
      for (const r of allRows) {
        const key = `${r.sale_channel ?? ""}||${r.brand ?? ""}||${r.customer_group ?? ""}`;
        map.set(key, (map.get(key) ?? 0) + Number(r.amount ?? 0));
        totalAmount += Number(r.amount ?? 0);
      }
      summaryRows = Array.from(map.entries())
        .map(([k, total]) => {
          const [sale_channel, brand, customer_group] = k.split("||");
          const ruleKey = `${resolveChannelName(sale_channel) ?? sale_channel}||${brand}||${customer_group}`;
          const profit_pct = ruleMap.get(ruleKey) ?? null;
          const profit = profit_pct !== null ? Math.round(total * profit_pct) : null;
          return { sale_channel: sale_channel || null, brand: brand || null, customer_group: customer_group || null, total, profit_pct, profit };
        })
        .sort((a, b) => {
          const ch = (a.sale_channel ?? "").localeCompare(b.sale_channel ?? "", "vi");
          if (ch !== 0) return ch;
          const br = (a.brand ?? "").localeCompare(b.brand ?? "", "vi");
          if (br !== 0) return br;
          const ai = customerGroupOrder.indexOf(a.customer_group ?? "");
          const bi = customerGroupOrder.indexOf(b.customer_group ?? "");
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
    }
  }

  // Tháng mặc định = tháng hiện tại
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Fetch dữ liệu dropship revenue cho tháng đang xem
  const dropshipMonth = dsMonth ?? defaultMonth;
  const { data: dropshipRows } = await admin
    .from("dropship_revenue")
    .select("channel_name, amount, customer_group")
    .eq("month", dropshipMonth);
  // Map key: "channel_name||customer_group" → { amount }
  const dropshipMap = new Map<string, DropshipEntry>(
    (dropshipRows ?? []).map((r: { channel_name: string; amount: unknown; customer_group: string }) => [
      `${r.channel_name}||${r.customer_group}`,
      { amount: Number(r.amount ?? 0) },
    ])
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
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

      {/* Upload form */}
      <div className="rounded-2xl border border-white/60 glass p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Upload size={16} />
          </div>
          <div>
            <div className="font-medium text-sm">Upload file Excel</div>
            <div className="text-xs text-neutral-500">Mỗi tháng 1 file — upload file mới sẽ ghi đè data cũ</div>
          </div>
        </div>
        <form action={uploadOrderFile} className="flex flex-col sm:flex-row gap-2 items-end">
          <label className="block text-sm flex-none">
            <div className="text-xs font-medium text-neutral-600 mb-1.5">Tháng</div>
            <input
              type="month"
              name="month"
              defaultValue={defaultMonth}
              required
              className="h-11 rounded-xl border border-neutral-200 bg-white px-3 text-[15px] outline-none focus:border-neutral-900"
            />
          </label>
          <label className="block text-sm flex-1 min-w-0">
            <div className="text-xs font-medium text-neutral-600 mb-1.5">File Excel (.xlsx)</div>
            <input
              type="file"
              name="file"
              accept=".xlsx,.xls"
              required
              className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm file:mr-3 file:h-7 file:rounded-md file:border-0 file:bg-neutral-100 file:px-2.5 file:text-xs file:font-medium file:cursor-pointer outline-none focus:border-neutral-900"
            />
          </label>
          <Button type="submit" size="sm" className="shrink-0 h-11">
            <Upload size={14} /> Upload
          </Button>
        </form>
        <p className="text-xs text-neutral-500">
          Cột bắt buộc: <b>Thành tiền</b>, <b>NV duyệt đơn</b>. Cột khác: Thời gian hoàn thành, Mã ĐH, Khách hàng, Brand, Phân nhóm KH.
        </p>
      </div>

      {/* Preview block */}
      {preview && previewFile && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-medium text-sm text-indigo-900">
                Preview tháng {preview ? `${Number(preview.split("-")[1])}-${preview.split("-")[0]}` : ""} — {previewFile.original_filename}
              </div>
              <div className="text-xs text-indigo-600 mt-0.5">
                {fmt(totalOrders)} đơn · Tổng Thành tiền: {fmt(totalAmount)}đ
              </div>
            </div>
            <a
              href="/admin/settings?tab=orders"
              className="text-xs text-indigo-600 hover:text-indigo-800 underline"
            >
              Đóng
            </a>
          </div>
          {summaryRows.length === 0 ? (
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
                  {summaryRows.map((r, i) => (
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
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Doanh thu Dropship */}
      <div className="rounded-2xl border border-white/60 glass p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <PackageSearch size={16} />
          </div>
          <div>
            <div className="font-medium text-sm">Doanh thu Dropship</div>
            <div className="text-xs text-neutral-500">Nhập tay doanh thu Dropship theo tháng để tính profit Sale/CSKH</div>
          </div>
        </div>

        {/* Form xem tháng — GET request, reload page với ds_month param */}
        <form method="GET" action="/admin/settings" className="flex items-end gap-2">
          <input type="hidden" name="tab" value="orders" />
          <label className="block text-sm flex-none">
            <div className="text-xs font-medium text-neutral-600 mb-1.5">Tháng</div>
            <input
              type="month"
              name="ds_month"
              defaultValue={dropshipMonth}
              required
              className="h-9 rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-900"
            />
          </label>
          <button type="submit" className="h-9 px-3 rounded-lg border border-neutral-200 bg-white text-sm font-medium hover:bg-neutral-50 shrink-0">
            Xem
          </button>
        </form>

        <form action={upsertDropshipRevenue} className="space-y-2">
          <input type="hidden" name="month" value={dropshipMonth} />

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/60">
                  <th className="text-left py-2 px-3 text-xs font-medium text-neutral-500 w-28">Nhóm KH</th>
                  {PROFIT_CHANNELS.map((ch) => (
                    <th key={ch} className="text-left py-2 px-3 text-xs font-medium text-neutral-600 whitespace-nowrap">
                      {ch}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {CUSTOMER_GROUPS.map((cg) => (
                  <tr key={cg}>
                    <td className="py-2 px-3 text-xs font-medium text-neutral-600 whitespace-nowrap">{cg}</td>
                    {PROFIT_CHANNELS.map((ch) => {
                      const entry = dropshipMap.get(`${ch}||${cg}`);
                      return (
                        <td key={ch} className="py-2 px-3">
                          <NumberInput
                            name={`amount_${ch}_${cg}`}
                            defaultValue={entry?.amount || undefined}
                            className="h-9 w-full min-w-[110px] rounded-lg border border-neutral-200 bg-white px-2.5 text-sm outline-none focus:border-neutral-900 tabular-nums"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={PROFIT_CHANNELS.length + 1} className="pt-3 px-3">
                    <Button type="submit" size="sm">Lưu</Button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </form>
      </div>

      {/* File list */}
      {!(files?.length) ? (
        <Empty icon={FileSpreadsheet} title="Chưa có file nào" description="Upload file Excel đầu tiên ở trên." />
      ) : (
        <div className="space-y-2">
          {(files as OrderFile[]).map((f) => (
            <div
              key={f.id}
              className={`rounded-2xl border ${preview === f.month ? "border-indigo-200 bg-indigo-50/40" : "border-white/60 glass"} p-3 flex items-center gap-3`}
            >
              <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <FileSpreadsheet size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{f.original_filename}</div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  Tháng <b>{f.month}</b> · {fmt(f.row_count)} đơn
                  {f.uploaded_by && ` · ${f.uploaded_by}`}
                  {" · "}
                  {formatDistanceToNow(new Date(f.created_at), { addSuffix: true, locale: vi })}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={`/admin/settings?tab=orders&preview=${f.month}`}
                  className="h-8 px-2.5 rounded-lg border border-neutral-200 bg-white text-xs font-medium hover:bg-neutral-50 inline-flex items-center gap-1.5 text-neutral-700"
                >
                  <Eye size={12} /> Preview
                </a>
                <form action={deleteOrderFile}>
                  <input type="hidden" name="id" value={f.id} />
                  <button
                    type="submit"
                    title="Xoá file này"
                    className="h-8 w-8 rounded-lg border border-neutral-200 bg-white inline-flex items-center justify-center text-neutral-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
                  >
                    <Trash2 size={13} />
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
