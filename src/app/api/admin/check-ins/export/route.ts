import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const officeId = url.searchParams.get("office");
  if (!from || !to) return NextResponse.json({ error: "Thiếu from/to" }, { status: 400 });

  const admin = createAdminClient();
  let query = admin
    .from("check_ins")
    .select("checked_in_at, distance_m, face_match_score, liveness_passed, latitude, longitude, employees(name, email), offices(name)")
    .gte("checked_in_at", from)
    .lte("checked_in_at", to)
    .order("checked_in_at", { ascending: false })
    .limit(10000);
  if (officeId) query = query.eq("office_id", officeId);

  const { data } = await query;

  const header = ["time", "name", "email", "office", "lat", "lng", "distance_m", "face_score", "liveness"];
  const csvQ = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = [header.join(",")];
  for (const r of data ?? []) {
    // @ts-expect-error — supabase join
    const emp = r.employees as { name: string; email: string } | null;
    // @ts-expect-error — supabase join
    const off = r.offices as { name: string } | null;
    lines.push(
      [
        csvQ(new Date(r.checked_in_at).toISOString()),
        csvQ(emp?.name),
        csvQ(emp?.email),
        csvQ(off?.name),
        r.latitude ?? "",
        r.longitude ?? "",
        r.distance_m ?? "",
        r.face_match_score ?? "",
        r.liveness_passed ? "1" : "0",
      ].join(","),
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="checkins_${from.slice(0, 10)}_${to.slice(0, 10)}.csv"`,
    },
  });
}
