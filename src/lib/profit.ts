import { createAdminClient } from "@/lib/supabase/admin";

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

  // 2. Lấy tất cả rules
  const channelNames = [...new Set(channels.map((c) => c.channel_name))];
  const { data: rules } = await admin
    .from("profit_rules")
    .select("*")
    .in("channel_name", channelNames);

  if (!rules?.length) return { items: [], total: 0 };

  // 3. Lấy order data cho tháng này
  const { data: orders } = await admin
    .from("order_data")
    .select("sale_channel, brand, customer_group, amount")
    .eq("month", month)
    .in("sale_channel", channelNames);

  if (!orders?.length) return { items: [], total: 0 };

  // 4. Aggregate revenue theo channel + brand + customer_group
  const revenueMap = new Map<string, number>();
  for (const o of orders) {
    const key = `${o.sale_channel}||${o.brand ?? ""}||${o.customer_group ?? ""}`;
    revenueMap.set(key, (revenueMap.get(key) ?? 0) + Number(o.amount ?? 0));
  }

  const items: EmployeeProfit[] = [];
  let grandTotal = 0;

  for (const ch of channels) {
    const isSale = ch.sale_employee_id === employeeId;
    const isCskh = ch.cskh_employee_id === employeeId;
    if (!isSale && !isCskh) continue;

    const channelRules = rules.filter((r) => r.channel_name === ch.channel_name);
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
