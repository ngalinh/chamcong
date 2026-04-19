import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { Empty } from "@/components/ui/Empty";
import { Button } from "@/components/ui/Button";
import { Inbox, Download, Trash2, MapPin, Calendar } from "lucide-react";
import Image from "next/image";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

export const dynamic = "force-dynamic";

async function deleteCheckIn(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");

  const id = String(formData.get("id"));
  const selfiePath = String(formData.get("selfie_path") ?? "");
  const admin = createAdminClient();
  await admin.from("check_ins").delete().eq("id", id);
  if (selfiePath) await admin.storage.from("selfies").remove([selfiePath]);
  revalidatePath("/admin/check-ins");
  revalidatePath("/admin");
}

type Row = {
  id: string;
  checked_in_at: string;
  distance_m: number | null;
  face_match_score: number | null;
  selfie_path: string;
  office_id: string | null;
  employees: { name: string; email: string } | null;
  offices: { name: string } | null;
  signedUrl: string;
};

export default async function CheckInsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; office?: string }>;
}) {
  const sp = await searchParams;
  const admin = createAdminClient();

  const from = sp.from ? new Date(sp.from) : new Date(Date.now() - 7 * 86400_000);
  const to = sp.to ? new Date(sp.to) : new Date();
  to.setHours(23, 59, 59, 999);

  const { data: offices } = await admin.from("offices").select("id, name").order("name");

  let query = admin
    .from("check_ins")
    .select("id, checked_in_at, distance_m, face_match_score, selfie_path, office_id, employees(name, email), offices(name)")
    .gte("checked_in_at", from.toISOString())
    .lte("checked_in_at", to.toISOString())
    .order("checked_in_at", { ascending: false })
    .limit(500);

  if (sp.office) query = query.eq("office_id", sp.office);

  const { data } = await query;

  const rows: Row[] = [];
  for (const r of data ?? []) {
    const { data: signed } = await admin.storage
      .from("selfies")
      .createSignedUrl(r.selfie_path, 3600);
    rows.push({
      ...r,
      // @ts-expect-error — supabase join
      employees: r.employees,
      // @ts-expect-error — supabase join
      offices: r.offices,
      signedUrl: signed?.signedUrl ?? "",
    });
  }

  const baseParams = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  if (sp.office) baseParams.set("office", sp.office);
  const csvHref = `/api/admin/check-ins/export?${baseParams.toString()}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Check-in</h1>
        <a href={csvHref}>
          <Button size="sm" variant="secondary">
            <Download size={14} /> CSV
          </Button>
        </a>
      </div>

      <form action="/admin/check-ins" className="flex flex-wrap gap-2 rounded-2xl border border-neutral-200 bg-white p-3">
        <FilterInput icon={Calendar} name="from" type="date" defaultValue={from.toISOString().slice(0, 10)} />
        <FilterInput icon={Calendar} name="to" type="date" defaultValue={to.toISOString().slice(0, 10)} />
        <div className="relative flex-1 min-w-[140px]">
          <MapPin size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <select
            name="office"
            defaultValue={sp.office ?? ""}
            className="h-9 w-full rounded-lg border border-neutral-200 pl-8 pr-2 text-sm outline-none focus:border-neutral-900"
          >
            <option value="">Tất cả chi nhánh</option>
            {offices?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <Button size="sm" type="submit">Lọc</Button>
      </form>

      {rows.length === 0 ? (
        <Empty icon={Inbox} title="Không có check-in" description="Điều chỉnh bộ lọc hoặc chờ nhân viên chấm công." />
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {rows.map((r) => (
              <MobileRow key={r.id} row={r} onDelete={deleteCheckIn} />
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block rounded-2xl border border-neutral-200 bg-white overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-neutral-50 text-left">
                <tr>
                  <th className="p-3 font-medium text-neutral-500">Nhân viên</th>
                  <th className="p-3 font-medium text-neutral-500">Chi nhánh</th>
                  <th className="p-3 font-medium text-neutral-500">Thời gian</th>
                  <th className="p-3 font-medium text-neutral-500">Match</th>
                  <th className="p-3 font-medium text-neutral-500">Cách</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        {r.signedUrl ? (
                          <Image src={r.signedUrl} width={40} height={40} alt="" className="rounded-lg object-cover h-10 w-10" unoptimized />
                        ) : <div className="h-10 w-10 rounded-lg bg-neutral-100" />}
                        <div>
                          <div className="font-medium">{r.employees?.name ?? "?"}</div>
                          <div className="text-xs text-neutral-500">{r.employees?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">{r.offices?.name ?? "—"}</td>
                    <td className="p-3 whitespace-nowrap">{format(new Date(r.checked_in_at), "dd/MM HH:mm", { locale: vi })}</td>
                    <td className="p-3"><MatchBadge score={r.face_match_score} /></td>
                    <td className="p-3 text-neutral-500">{Math.round(r.distance_m ?? 0)}m</td>
                    <td className="p-3">
                      <form action={deleteCheckIn}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="selfie_path" value={r.selfie_path} />
                        <Button size="sm" variant="danger" type="submit"><Trash2 size={14} /></Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function MobileRow({ row: r, onDelete }: { row: Row; onDelete: (fd: FormData) => void }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 flex gap-3">
      {r.signedUrl ? (
        <Image src={r.signedUrl} width={64} height={64} alt="" className="rounded-xl object-cover h-16 w-16 shrink-0" unoptimized />
      ) : <div className="h-16 w-16 rounded-xl bg-neutral-100 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="font-medium truncate">{r.employees?.name ?? "?"}</div>
          <MatchBadge score={r.face_match_score} />
        </div>
        <div className="text-xs text-neutral-500 truncate">{r.employees?.email}</div>
        <div className="mt-1.5 flex items-center gap-2 text-xs text-neutral-600">
          <span className="truncate">{r.offices?.name ?? "—"}</span>
          <span>·</span>
          <span className="whitespace-nowrap">{format(new Date(r.checked_in_at), "dd/MM HH:mm", { locale: vi })}</span>
          <span>·</span>
          <span>{Math.round(r.distance_m ?? 0)}m</span>
        </div>
      </div>
      <form action={onDelete} className="self-start">
        <input type="hidden" name="id" value={r.id} />
        <input type="hidden" name="selfie_path" value={r.selfie_path} />
        <Button size="sm" variant="danger" type="submit"><Trash2 size={14} /></Button>
      </form>
    </div>
  );
}

function MatchBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-neutral-400">—</span>;
  const ok = score < 0.5;
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
      {score.toFixed(2)}
    </span>
  );
}

function FilterInput({
  icon: Icon,
  ...rest
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <Icon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
      <input
        className="h-9 rounded-lg border border-neutral-200 pl-8 pr-2 text-sm outline-none focus:border-neutral-900"
        {...rest}
      />
    </div>
  );
}
