"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function upsertOffice(formData: FormData) {
  const admin = createAdminClient();
  const id = formData.get("id") as string;
  const is_remote = formData.get("is_remote") === "on";
  const approverRaw = String(formData.get("approver_email") ?? "").trim();
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
    redirect(`/admin/settings?tab=branches&error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/admin/settings");
  redirect(
    `/admin/settings?tab=branches&ok=${encodeURIComponent(id ? "Đã lưu " + payload.name : "Đã thêm " + payload.name)}`
  );
}

export async function deleteOffice(formData: FormData) {
  const id = formData.get("id") as string;
  const { error } = await createAdminClient().from("offices").delete().eq("id", id);
  if (error) {
    redirect(`/admin/settings?tab=branches&error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?tab=branches&ok=${encodeURIComponent("Đã xoá chi nhánh")}`);
}
