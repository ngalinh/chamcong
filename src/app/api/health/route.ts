import { NextResponse } from "next/server";

// Endpoint nhẹ nhất có thể — không touch DB. Dùng cho:
// - Docker HEALTHCHECK
// - Deploy script verify container ready
// - nginx upstream health probe
export const runtime = "nodejs";
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({ ok: true });
}
