import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { Building2, Plus, Trash2, MapPin } from "lucide-react";
import type { Office } from "@/types/db";

export const dynamic = "force-dynamic";

async function upsertOffice(formData: FormData) {
  "use server";
  const admin = createAdminClient();
  const id = formData.get("id") as string;
  const payload = {
    name: String(formData.get("name") ?? ""),
    address: String(formData.get("address") ?? ""),
    latitude: Number(formData.get("latitude")),
    longitude: Number(formData.get("longitude")),
    radius_m: Number(formData.get("radius_m")),
    timezone: String(formData.get("timezone") ?? "Asia/Ho_Chi_Minh"),
    is_active: formData.get("is_active") === "on",
  };
  if (id) await admin.from("offices").update(payload).eq("id", id);
  else await admin.from("offices").insert(payload);
  revalidatePath("/admin/settings");
}

async function deleteOffice(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  await createAdminClient().from("offices").delete().eq("id", id);
  revalidatePath("/admin/settings");
}

export default async function SettingsPage() {
  const admin = createAdminClient();
  const { data: offices } = await admin
    .from("offices")
    .select("*")
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Chi nhánh</h1>

      {!offices?.length && (
        <Empty icon={Building2} title="Chưa có chi nhánh" description="Thêm chi nhánh đầu tiên bên dưới." />
      )}

      <div className="space-y-3">
        {(offices as Office[] | null)?.map((o) => (
          <OfficeForm key={o.id} office={o} action={upsertOffice} onDelete={deleteOffice} />
        ))}
        <OfficeForm action={upsertOffice} />
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
    <form action={action} className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
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
            <div className="h-9 w-9 rounded-lg bg-neutral-100 flex items-center justify-center">
              <Building2 size={16} className="text-neutral-600" />
            </div>
            <h2 className="font-semibold flex-1 truncate">{office.name}</h2>
            {!office.is_active && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">Khoá</span>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tên chi nhánh" name="name" required defaultValue={office?.name} />
        <Field label="Bán kính (m)" name="radius_m" type="number" defaultValue={office?.radius_m ?? 100} />
      </div>

      <Field label="Địa chỉ" name="address" defaultValue={office?.address ?? ""} icon={MapPin} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude" name="latitude" type="number" step="any" required defaultValue={office?.latitude} />
        <Field label="Longitude" name="longitude" type="number" step="any" required defaultValue={office?.longitude} />
      </div>

      <div className="grid grid-cols-2 gap-3 items-end">
        <Field label="Timezone" name="timezone" defaultValue={office?.timezone ?? "Asia/Ho_Chi_Minh"} />
        <label className="flex items-center gap-2 text-sm h-10">
          <input type="checkbox" name="is_active" defaultChecked={office ? office.is_active : true} className="h-4 w-4 rounded" />
          Đang hoạt động
        </label>
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
}: {
  label: string;
  name: string;
  type?: string;
  step?: string;
  required?: boolean;
  defaultValue?: string | number | null;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
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
          required={required}
          defaultValue={defaultValue ?? ""}
          className={`w-full h-10 rounded-xl border border-neutral-200 ${Icon ? "pl-9" : "pl-3"} pr-3 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/5`}
        />
      </div>
    </label>
  );
}
