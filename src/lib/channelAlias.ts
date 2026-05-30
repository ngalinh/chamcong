// Map tên NV/kênh được lưu trong order_data → tên kênh trong profit_rules
// Dùng khi lookup profit, không đổi data trong DB
export const CHANNEL_ALIAS_MAP: Record<string, string> = {
  "thư": "ShipUS",
};

export function resolveChannelName(raw: string | null): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  for (const [pattern, channel] of Object.entries(CHANNEL_ALIAS_MAP)) {
    if (key === pattern || key.includes(pattern)) return channel;
  }
  return raw.trim() || null;
}
