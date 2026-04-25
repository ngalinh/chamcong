import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToAdmins } from "@/lib/push";

export const runtime = "nodejs";

const Schema = z.object({
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ"),
  items: z.array(z.object({
    description: z.string().min(1, "Vui lòng nhập lỗi vi phạm").max(200),
    amount: z.number().min(0).max(100_000_000),
  })).min(1, "Vui lòng thêm ít nhất 1 lỗi vi phạm").max(50),
  reason: z.string().max(500).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: emp } = await admin
    .from("employees")
    .select("id, name, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!emp || !emp.is_active)
    return NextResponse.json({ error: "Tài khoản không hợp lệ" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const data = parsed.data;

  const totalAmount = data.items.reduce((s, it) => s + it.amount, 0);

  const { data: created, error } = await admin
    .from("violation_reports")
    .insert({
      employee_id: emp.id,
      report_date: data.report_date,
      total_amount: totalAmount,
      reason: data.reason ?? null,
    })
    .select("id")
    .single();
  if (error || !created)
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });

  const items = data.items.map((it, idx) => ({
    report_id: created.id,
    description: it.description.trim(),
    amount: it.amount,
    position: idx,
  }));
  const { error: itemsErr } = await admin.from("violation_items").insert(items);
  if (itemsErr) {
    await admin.from("violation_reports").delete().eq("id", created.id);
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  sendPushToAdmins({
    title: "⚠️ Đơn vi phạm mới",
    body: `${emp.name}: ${data.items.length} lỗi · ${totalAmount.toLocaleString("en-US")} VND`,
    url: "/admin/history?type=violation",
    tag: `violation-new-${emp.id}`,
  }).catch((e) => console.error("[push] admin notify failed", e));

  return NextResponse.json({ ok: true });
}
