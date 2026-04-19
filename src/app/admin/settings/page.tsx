import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import Link from "next/link";
import { Building2, Plus, Trash2, MapPin, AlertTriangle, CheckCircle2, Wifi, Mail } from "lucide-react";
import type { Office } from "@/types/db";

export const dynamic = "force-dynamic";

async function upsertOffice(formData: FormData) {
  "use server";
  const admin = createAdminClient();
  const id = formData.get("id") as string;
  const is_remote = formData.get("is_remote") === "on";
  const approverRaw = String(formData.get("approver_email") ?? "").trim();
  // Timezone luôn là VN — không còn field cho từng chi nhánh
  const payload = {
    name: String(formData.get("name") ?? ""),
    address: String(formData.get("address") ?? ""),
    latitude: is_remote ? 0 : Number(formData.get("latitude")),
    longitude: is_remote ? 0 : Number(formData.get("longitude")),
    radius_m: is_remote ? 0 : Number(formData.get("radius_m")),
    timezone: "Asia/Ho_Chi_Minh",
    work_start_time: String(formData.get("work_start_time") ?? "09:00"),
    work_end_time: String(formData.get("work_end_time") ?? "18:00"),
    is_active: formData.get("is_active") === "on",
    is_remote,
    approver_email: approverRaw ? approverRaw.toLowerCase() : null,
  };

  const { error } = id
    ? await admin.from("offices").update(payload).eq("id", id)
    : await admin.from("offices").insert(payload);

  if (error) {
    redirect(`/admin/settings?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?ok=${encodeURIComponent(id ? "Đã lưu " + payload.name : "Đã thêm " + payload.name)}`);
}

async function deleteOffice(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  const { error } = await createAdminClient().from("offices").delete().eq("id", id);
  if (error) {
    redirect(`/admin/settings?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?ok=${encodeURIComponent("Đã xoá chi nhánh")}`);
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; new?: string }>;
}) {
  const sp = await searchParams;
  const showNew = sp.new === "1";
  const admin = createAdminClient();
  const { data: offices } = await admin
    .from("offices")
    .select("*")
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Chi nhánh</h1>
        {!showNew && (
          <Link
            href="/admin/settings?new=1"
            className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 text-white text-sm font-medium h-9 px-3 hover:bg-neutral-800"
          >
            <Plus size={14} /> Thêm chi nhánh
          </Link>
        )}
      </div>

      {sp.error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-900 p-3 text-sm flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium">Không lưu được</div>
            <div className="text-xs mt-0.5 break-words">{sp.error}</div>
            {sp.error.includes("work_start_time") || sp.error.includes("work_end_time") ? (
              <div className="text-xs mt-1.5 text-rose-700">
                → Migration DB chưa chạy. Chạy SQL <code className="bg-rose-100 px-1 rounded">20260419210000_checkin_checkout_work_hours.sql</code> trong Supabase Editor.
              </div>
            ) : null}
          </div>
        </div>
      )}
      {sp.ok && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 p-3 text-sm flex items-center gap-2">
          <CheckCircle2 size={16} className="shrink-0" /> {sp.ok}
        </div>
      )}

      {!offices?.length && (
        <Empty icon={Building2} title="Chưa có chi nhánh" description="Thêm chi nhánh đầu tiên bên dưới." />
      )}

      <div className="space-y-3">
        {(offices as Office[] | null)?.map((o) => (
          <OfficeForm key={o.id} office={o} action={upsertOffice} onDelete={deleteOffice} />
        ))}
        {showNew && <OfficeForm action={upsertOffice} />}
      </div>

      <p className="text-xs text-neutral-500 max-w-2xl leading-relaxed">
        💡 Lấy tọa độ chính xác: mở Google Maps → click chuột phải vào toà nhà → copy dãy số lat, lng → paste vào đây.
        Bán kính khuyến nghị <b>100m</b> cân bằng giữa độ chặt và sai số GPS.
      </p>
    </div>
  );
}

function OfficeForm({
  office,
  action,
  onDelete,
}: {
  office?: Office;
  action: (formData: FormData) => void;
  onDelete?: (formData: FormData) => void;
}) {
  const isNew = !office;
  return (
    <form action={action} className="rounded-2xl border border-white/60 glass p-4 space-y-3">
      {office && <input type="hidden" name="id" value={office.id} />}

      <div className="flex items-center gap-2">
        {isNew ? (
          <>
            <div className="h-9 w-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Plus size={16} />
            </div>
            <h2 className="font-semibold">Thêm chi nhánh</h2>
          </>
        ) : (
          <>
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${office.is_remote ? "bg-violet-50 text-violet-600" : "bg-neutral-100 text-neutral-600"}`}>
              {office.is_remote ? <Wifi size={16} /> : <Building2 size={16} />}
            </div>
            <h2 className="font-semibold flex-1 truncate">{office.name}</h2>
            {office.is_remote && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">Remote</span>
            )}
            {!office.is_active && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">Khoá</span>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Tên chi nhánh" name="name" required defaultValue={office?.name} />
        <Field
          label="Bán kính (m)"
          name="radius_m"
          type="number"
          defaultValue={office?.radius_m ?? 100}
          disabled={office?.is_remote}
        />
      </div>

      <Field
        label="Địa chỉ"
        name="address"
        defaultValue={office?.address ?? ""}
        icon={MapPin}
        disabled={office?.is_remote}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Latitude"  name="latitude"  type="number" step="any" required={!office?.is_remote} defaultValue={office?.latitude}  disabled={office?.is_remote} />
        <Field label="Longitude" name="longitude" type="number" step="any" required={!office?.is_remote} defaultValue={office?.longitude} disabled={office?.is_remote} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TimeField
          label="Giờ bắt đầu làm"
          name="work_start_time"
          defaultValue={office?.work_start_time?.slice(0, 5) ?? "09:00"}
        />
        <TimeField
          label="Giờ tan làm"
          name="work_end_time"
          defaultValue={office?.work_end_time?.slice(0, 5) ?? "18:00"}
        />
      </div>

      <Field
        label="Email admin duyệt nghỉ"
        name="approver_email"
        type="email"
        defaultValue={office?.approver_email ?? ""}
        icon={Mail}
        placeholder="vd: dzuong.bol@gmail.com"
      />

      <div className="flex items-center gap-6 flex-wrap text-sm h-10">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_active" defaultChecked={office ? office.is_active : true} className="h-4 w-4 rounded" />
          Đang hoạt động
        </label>
        {/* Checkbox "Làm online" chỉ hiện cho office mới (chưa lưu) hoặc office hiện đã là remote.
            Office văn phòng thật không nên đổi qua remote sau khi đã có check-in. */}
        {(isNew || office?.is_remote) && (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_remote" defaultChecked={office?.is_remote ?? false} className="h-4 w-4 rounded" />
            Làm online (không cần selfie/định vị)
          </label>
        )}
        {!isNew && !office?.is_remote && (
          <input type="hidden" name="is_remote" value="" />
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm">{isNew ? "Thêm" : "Lưu"}</Button>
        {office && onDelete && (
          <Button formAction={onDelete} size="sm" variant="danger" type="submit">
            <Trash2 size={14} /> Xoá
          </Button>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  step,
  required,
  defaultValue,
  icon: Icon,
  disabled,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  step?: string;
  required?: boolean;
  defaultValue?: string | number | null;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <div className="text-xs font-medium text-neutral-600 mb-1.5">{label}</div>
      <div className="relative">
        {Icon && <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />}
        <input
          name={name}
          type={type}
          step={step}
          required={required && !disabled}
          disabled={disabled}
          placeholder={placeholder}
          defaultValue={defaultValue ?? ""}
          className={`w-full h-11 rounded-xl border border-neutral-200 bg-white ${Icon ? "pl-9" : "pl-3"} pr-3 text-[15px] outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/5 disabled:bg-neutral-50 disabled:text-neutral-400`}
        />
      </div>
    </label>
  );
}

function TimeField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <label className="block text-sm">
      <div className="text-xs font-medium text-neutral-600 mb-1.5">{label}</div>
      <input
        name={name}
        type="time"
        required
        defaultValue={defaultValue}
        step={60}
        className="w-full h-11 rounded-xl border border-neutral-200 bg-white px-3 text-[15px] font-mono tabular-nums outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/5 appearance-none"
        style={{ WebkitAppearance: "none" }}
      />
    </label>
  );
}
