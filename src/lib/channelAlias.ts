// Map tên NV/kênh được lưu trong order_data → tên kênh trong profit_rules
// Key phải khớp đúng casing như trong file Excel (để .in() query không bị miss)
// Dùng khi lookup profit, không đổi data trong DB
export const CHANNEL_ALIAS_MAP: Record<string, string> = {
  "Thư": "ShipUS",
};

export function resolveChannelName(raw: string | null): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  for (const [pattern, channel] of Object.entries(CHANNEL_ALIAS_MAP)) {
    const p = pattern.toLowerCase();
    if (key === p || key.includes(p)) return channel;
  }
  return raw.trim() || null;
}
