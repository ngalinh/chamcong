import { createAdminClient } from "@/lib/supabase/admin";
import { resolveChannelName, CHANNEL_ALIAS_MAP } from "@/lib/channelAlias";

// Cho một mảng rows, group theo key, mỗi group pick row có effective_from cao nhất <= month
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dedupeByEffectiveFrom<T extends Record<string, any>>(
  rows: T[],
  keyFn: (r: T) => string,
  month: string,
): T[] {
  const map = new Map<string, T>();
  for (const r of rows) {
    const from = r.effective_from ?? "";
    if (from > month) continue; // future rule — chưa áp dụng
    const key = keyFn(r);
    const existing = map.get(key);
    if (!existing || (existing.effective_from ?? "") < from) {
      map.set(key, r);
    }
  }
  return Array.from(map.values());
}

export type EmployeeProfit = {
  channel_name: string;
  role: "sale" | "cskh" | "total";
  details: {
    brand: string;
    customer_group: string;
    revenue: number;
    profit_pct: number;
    profit: number;
    share_pct: number;
    employee_profit: number;
  }[];
  total_employee_profit: number;
};

// Override % chia profit cho trường hợp đặc biệt theo từng tháng.
// Format key: "YYYY-MM|channel_name|sale hoặc cskh"
const SHARE_PCT_OVERRIDES: Record<string, number> = {
  "2026-05|Linh Dương|cskh": 0.10, // Tuyền Nguyễn tháng 5/2026 chỉ 10% thay vì 30%
};

async function computeChannelProfitForEmployee(
  employeeId: string,
  month: string, // YYYY-MM
): Promise<{ items: EmployeeProfit[]; total: number }> {
  const admin = createAdminClient();

  // 1. Tìm các channel mà employee này TỪNG là SALE hoặc CSKH (bất kỳ effective_from nào)
  const { data: myRows } = await admin
    .from("profit_channels")
    .select("channel_name")
    .or(`sale_employee_id.eq.${employeeId},cskh_employee_id.eq.${employeeId}`);

  if (!myRows?.length) return { items: [], total: 0 };

  // 1b. Lấy TẤT CẢ rows của các channel đó (mọi nhân viên) để xác định row hiệu lực đúng.
  // Nếu chỉ lấy rows của riêng employee này, một reassignment sang NV khác (row effective_from
  // mới hơn) sẽ không "thấy" được → vẫn tính nhầm profit cho NV cũ.
  const channelNames = [...new Set(myRows.map((c) => c.channel_name))];
  const { data: channels } = await admin
    .from("profit_channels")
    .select("*")
    .in("channel_name", channelNames);

  if (!channels?.length) return { items: [], total: 0 };

  // Deduplicate channels: per channel_name, pick row with latest effective_from <= month
  const effectiveChannels = dedupeByEffectiveFrom(channels, (c) => c.channel_name, month);
  if (!effectiveChannels.length) return { items: [], total: 0 };

  // 2. Lấy TẤT CẢ profit_rules, không giới hạn theo kênh — % Profit chỉ phụ thuộc
  // Brand + Nhóm KH, không phân biệt kênh (giống hệt logic ở trang preview đơn hàng
  // OrdersTab.tsx: rule đúng kênh ưu tiên trước, không có thì rule chung, cuối cùng
  // fallback rule của bất kỳ kênh nào khác đang có cho đúng Brand+Nhóm KH đó).
  const { data: rules } = await admin.from("profit_rules").select("*");

  if (!rules?.length) return { items: [], total: 0 };

  // Deduplicate rules: per (channel_name, brand, customer_group), pick latest effective_from <= month
  const effectiveRules = dedupeByEffectiveFrom(
    rules,
    (r) => `${r.channel_name}||${r.brand}||${r.customer_group}`,
    month,
  );

  // 3. Lấy order data và dropship_revenue cho tháng này
  // Bao gồm cả tên gốc trong DB (vd "Thư") lẫn tên kênh chuẩn (vd "ShipUS")
  const rawAliases = Object.entries(CHANNEL_ALIAS_MAP)
    .filter(([, ch]) => channelNames.includes(ch))
    .map(([raw]) => raw);
  const saleChannelFilter = [...channelNames, ...rawAliases];

  // PostgREST mặc định giới hạn 1000 dòng/query — kênh nào >1000 đơn/tháng sẽ bị cắt bớt
  // nếu query 1 lần. Phân trang giống OrdersTab.tsx để lấy đủ toàn bộ.
  type OrderRow = { sale_channel: string | null; brand: string | null; customer_group: string | null; amount: number };
  const orders: OrderRow[] = [];
  const BATCH = 1000;
  for (let from = 0; ; from += BATCH) {
    const { data: batch } = await admin
      .from("order_data")
      .select("sale_channel, brand, customer_group, amount")
      .eq("month", month)
      .in("sale_channel", saleChannelFilter)
      .range(from, from + BATCH - 1);
    if (!batch || batch.length === 0) break;
    orders.push(...batch);
    if (batch.length < BATCH) break;
  }

  const { data: dropshipRows } = await admin
    .from("dropship_revenue")
    .select("channel_name, customer_group, amount")
    .eq("month", month)
    .in("channel_name", channelNames);

  if (!orders.length && !dropshipRows?.length) return { items: [], total: 0 };

  // 4. Aggregate revenue theo channel + brand + customer_group
  // resolveChannelName để map tên NV trong DB (vd "Thư") → tên kênh profit (vd "ShipUS")
  const revenueMap = new Map<string, number>();
  for (const o of orders) {
    const ch = resolveChannelName(o.sale_channel) ?? o.sale_channel;
    const key = `${ch}||${o.brand ?? ""}||${o.customer_group ?? ""}`;
    revenueMap.set(key, (revenueMap.get(key) ?? 0) + Number(o.amount ?? 0));
  }
  // Dropship revenue: brand = "Dropship"
  for (const d of (dropshipRows ?? [])) {
    const key = `${d.channel_name}||Dropship||${d.customer_group ?? ""}`;
    revenueMap.set(key, (revenueMap.get(key) ?? 0) + Number(d.amount ?? 0));
  }

  const items: EmployeeProfit[] = [];
  let grandTotal = 0;

  for (const ch of effectiveChannels) {
    const isSale = ch.sale_employee_id === employeeId;
    const isCskh = ch.cskh_employee_id === employeeId;
    if (!isSale && !isCskh) continue;

    // 3 bậc ưu tiên rule, giống hệt OrdersTab.tsx: rule đúng kênh → rule chung (channel_name="")
    // → rule của bất kỳ kênh nào khác đang có cho đúng Brand+Nhóm KH (borrow).
    const specificRules = new Map(
      effectiveRules
        .filter((r) => r.channel_name === ch.channel_name)
        .map((r) => [`${r.brand}||${r.customer_group}`, r]),
    );
    const globalRules = new Map(
      effectiveRules
        .filter((r) => r.channel_name === "")
        .map((r) => [`${r.brand}||${r.customer_group}`, r]),
    );
    const anyChannelRules = new Map<string, (typeof effectiveRules)[number]>();
    for (const r of effectiveRules) {
      const key = `${r.brand}||${r.customer_group}`;
      if (!anyChannelRules.has(key)) anyChannelRules.set(key, r);
    }

    const details: EmployeeProfit["details"] = [];
    let channelTotal = 0;

    for (const [key, revenue] of revenueMap) {
      const [revCh, brand, customer_group] = key.split("||");
      if (revCh !== ch.channel_name || !revenue) continue;

      const bcKey = `${brand}||${customer_group}`;
      const rule = specificRules.get(bcKey) ?? globalRules.get(bcKey) ?? anyChannelRules.get(bcKey);
      if (!rule) continue;

      const profit = revenue * rule.profit_pct;
      const role = isSale ? "sale" : "cskh";
      const share_pct = SHARE_PCT_OVERRIDES[`${month}|${ch.channel_name}|${role}`]
        ?? (isSale ? (ch as { sale_pct: number }).sale_pct : (ch as { cskh_pct: number }).cskh_pct);
      const employee_profit = profit * share_pct;

      details.push({
        brand,
        customer_group,
        revenue,
        profit_pct: rule.profit_pct,
        profit,
        share_pct,
        employee_profit,
      });
      channelTotal += employee_profit;
    }

    if (details.length > 0 || channelTotal > 0) {
      items.push({
        channel_name: ch.channel_name,
        role: isSale ? "sale" : "cskh",
        details,
        total_employee_profit: channelTotal,
      });
      grandTotal += channelTotal;
    }
  }

  return { items, total: grandTotal };
}

async function computeTotalProfitForMonth(month: string): Promise<number> {
  const admin = createAdminClient();
  const { data: rules } = await admin.from("profit_rules").select("*");
  if (!rules?.length) return 0;

  const effectiveRules = dedupeByEffectiveFrom(
    rules,
    (rule) => `${rule.channel_name}||${rule.brand}||${rule.customer_group}`,
    month,
  );
  const specificRules = new Map(
    effectiveRules.map((rule) => [`${rule.channel_name}||${rule.brand}||${rule.customer_group}`, rule.profit_pct]),
  );
  const globalRules = new Map(
    effectiveRules
      .filter((rule) => rule.channel_name === "")
      .map((rule) => [`${rule.brand}||${rule.customer_group}`, rule.profit_pct]),
  );
  const fallbackRules = new Map<string, number>();
  for (const rule of effectiveRules) {
    const key = `${rule.brand}||${rule.customer_group}`;
    if (!fallbackRules.has(key)) fallbackRules.set(key, rule.profit_pct);
  }

  type RevenueRow = { sale_channel: string | null; brand: string | null; customer_group: string | null; amount: number };
  const orders: RevenueRow[] = [];
  const batchSize = 1000;
  for (let from = 0; ; from += batchSize) {
    const { data: batch } = await admin
      .from("order_data")
      .select("sale_channel, brand, customer_group, amount")
      .eq("month", month)
      .range(from, from + batchSize - 1);
    if (!batch?.length) break;
    orders.push(...batch);
    if (batch.length < batchSize) break;
  }

  const { data: dropshipRows } = await admin
    .from("dropship_revenue")
    .select("channel_name, customer_group, amount")
    .eq("month", month);

  let totalProfit = 0;
  for (const order of orders) {
    const channel = resolveChannelName(order.sale_channel) ?? order.sale_channel ?? "";
    const brandGroupKey = `${order.brand ?? ""}||${order.customer_group ?? ""}`;
    const profitPct = specificRules.get(`${channel}||${brandGroupKey}`)
      ?? globalRules.get(brandGroupKey)
      ?? fallbackRules.get(brandGroupKey);
    if (profitPct !== undefined) totalProfit += Number(order.amount ?? 0) * profitPct;
  }
  for (const row of dropshipRows ?? []) {
    const brandGroupKey = `Dropship||${row.customer_group ?? ""}`;
    const profitPct = specificRules.get(`${row.channel_name}||${brandGroupKey}`)
      ?? globalRules.get(brandGroupKey)
      ?? fallbackRules.get(brandGroupKey);
    if (profitPct !== undefined) totalProfit += Number(row.amount ?? 0) * profitPct;
  }
  return totalProfit;
}

export async function computeProfitForEmployee(
  employeeId: string,
  month: string,
): Promise<{ items: EmployeeProfit[]; total: number }> {
  const admin = createAdminClient();
  const [{ data: totalShareRows }, channelProfit] = await Promise.all([
    admin.from("profit_total_shares").select("*").eq("employee_id", employeeId),
    computeChannelProfitForEmployee(employeeId, month),
  ]);
  const effectiveShare = dedupeByEffectiveFrom(totalShareRows ?? [], () => employeeId, month)[0];
  if (!effectiveShare || Number(effectiveShare.profit_pct) <= 0) return channelProfit;

  const companyProfit = await computeTotalProfitForMonth(month);
  const totalShare = companyProfit * Number(effectiveShare.profit_pct);
  if (totalShare <= 0) return channelProfit;

  return {
    items: [
      ...channelProfit.items,
      {
        channel_name: "Tổng profit toàn công ty",
        role: "total",
        details: [],
        total_employee_profit: totalShare,
      },
    ],
    total: channelProfit.total + totalShare,
  };
}
