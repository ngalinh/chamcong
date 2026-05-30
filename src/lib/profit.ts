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
  role: "sale" | "cskh";
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

export async function computeProfitForEmployee(
  employeeId: string,
  month: string, // YYYY-MM
): Promise<{ items: EmployeeProfit[]; total: number }> {
  const admin = createAdminClient();

  // 1. Tìm channels mà employee này là SALE hoặc CSKH
  const { data: channels } = await admin
    .from("profit_channels")
    .select("*")
    .or(`sale_employee_id.eq.${employeeId},cskh_employee_id.eq.${employeeId}`);

  if (!channels?.length) return { items: [], total: 0 };

  // Deduplicate channels: per channel_name, pick row with latest effective_from <= month
  const channelNames = [...new Set(channels.map((c) => c.channel_name))];
  const effectiveChannels = dedupeByEffectiveFrom(channels, (c) => c.channel_name, month);
  if (!effectiveChannels.length) return { items: [], total: 0 };

  // 2. Lấy tất cả rules (mọi effective_from), lọc và dedupe client-side
  const { data: rules } = await admin
    .from("profit_rules")
    .select("*")
    .in("channel_name", channelNames);

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

  const [{ data: orders }, { data: dropshipRows }] = await Promise.all([
    admin
      .from("order_data")
      .select("sale_channel, brand, customer_group, amount")
      .eq("month", month)
      .in("sale_channel", saleChannelFilter),
    admin
      .from("dropship_revenue")
      .select("channel_name, customer_group, amount")
      .eq("month", month)
      .in("channel_name", channelNames),
  ]);

  if (!orders?.length && !dropshipRows?.length) return { items: [], total: 0 };

  // 4. Aggregate revenue theo channel + brand + customer_group
  // resolveChannelName để map tên NV trong DB (vd "Thư") → tên kênh profit (vd "ShipUS")
  const revenueMap = new Map<string, number>();
  for (const o of (orders ?? [])) {
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

    const channelRules = effectiveRules.filter((r) => r.channel_name === ch.channel_name);
    const details: EmployeeProfit["details"] = [];
    let channelTotal = 0;

    for (const rule of channelRules) {
      const key = `${ch.channel_name}||${rule.brand}||${rule.customer_group}`;
      const revenue = revenueMap.get(key) ?? 0;
      if (!revenue) continue;

      const profit = revenue * rule.profit_pct;
      const share_pct = isSale ? (ch as { sale_pct: number }).sale_pct : (ch as { cskh_pct: number }).cskh_pct;
      const employee_profit = profit * share_pct;

      details.push({
        brand: rule.brand,
        customer_group: rule.customer_group,
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
