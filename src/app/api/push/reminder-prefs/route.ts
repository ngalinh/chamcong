import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: emp } = await admin
    .from("employees")
    .select("reminder_shift_indices")
    .ilike("email", user.email)
    .maybeSingle();

  if (!emp) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ indices: emp.reminder_shift_indices ?? [] });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const indices = body?.indices;
  if (!Array.isArray(indices) || indices.some((i) => typeof i !== "number" || i < 0)) {
    return NextResponse.json({ error: "indices phải là mảng số nguyên không âm" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("employees")
    .update({ reminder_shift_indices: indices })
    .ilike("email", user.email);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
