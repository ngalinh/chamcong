"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import ExcelJS from "exceljs";

// ─── helpers ───────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: me } = await supabase
    .from("employees")
    .select("is_admin, email")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.is_admin && !isAdminEmail(user.email)) throw new Error("Forbidden");
  return user;
}

function ok(tab: string, msg: string): never {
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?tab=${tab}&ok=${encodeURIComponent(msg)}`);
  throw new Error("unreachable"); // redirect() always throws
}

function err(tab: string, msg: string): never {
  redirect(`/admin/settings?tab=${tab}&error=${encodeURIComponent(msg)}`);
  throw new Error("unreachable"); // redirect() always throws
}

// ─── profit_channels ───────────────────────────────────────────────────────

export async function upsertProfitChannel(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const id = formData.get("id") as string | null;
  const channel_name = String(formData.get("channel_name") ?? "").trim();
  const saleRaw = formData.get("sale_employee_id") as string | null;
  const cskhRaw = formData.get("cskh_employee_id") as string | null;
  if (!channel_name) err("profit", "Thiếu kênh NV");

  const payload = {
    channel_name,
    sale_employee_id: saleRaw || null,
    cskh_employee_id: cskhRaw || null,
  };

  const { error } = id
    ? await admin.from("profit_channels").update({
        sale_employee_id: saleRaw || null,
        cskh_employee_id: cskhRaw || null,
      }).eq("id", id)
    : await admin.from("profit_channels").insert(payload);

  if (error) err("profit", error.message);
  ok("profit", id ? "Đã cập nhật kênh NV" : "Đã thêm kênh NV");
}

export async function deleteProfitChannel(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const { error } = await createAdminClient().from("profit_channels").delete().eq("id", id);
  if (error) err("profit", error.message);
  ok("profit", "Đã xoá kênh NV");
}

// ─── profit_rules ──────────────────────────────────────────────────────────

export async function upsertProfitRule(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const id = formData.get("id") as string | null;
  const channel_name = String(formData.get("channel_name") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim();
  const customer_group = String(formData.get("customer_group") ?? "").trim();
  const profit_pct = Number(formData.get("profit_pct") ?? 0);
  const sale_pct_raw = Number(formData.get("sale_pct") ?? 0);
  const cskh_pct_raw = Number(formData.get("cskh_pct") ?? 0);

  if (!channel_name || !brand || !customer_group) err("profit", "Thiếu thông tin");
  if (!Number.isFinite(profit_pct) || profit_pct <= 0) err("profit", "% profit không hợp lệ");

  const sale_pct = sale_pct_raw / 100;
  const cskh_pct = cskh_pct_raw / 100;

  const payload = { channel_name, brand, customer_group, profit_pct, sale_pct, cskh_pct };

  const { error } = id
    ? await admin.from("profit_rules").update({ profit_pct, sale_pct, cskh_pct }).eq("id", id)
    : await admin.from("profit_rules").upsert(payload, { onConflict: "channel_name,brand,customer_group" });

  if (error) err("profit", error.message);
  ok("profit", id ? "Đã cập nhật rule" : "Đã thêm rule");
}

export async function deleteProfitRule(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const { error } = await createAdminClient().from("profit_rules").delete().eq("id", id);
  if (error) err("profit", error.message);
  ok("profit", "Đã xoá rule");
}

// ─── order files ───────────────────────────────────────────────────────────

function parseAmount(val: unknown): number {
  if (typeof val === "number") return Math.round(val);
  const s = String(val ?? "").replace(/[^\d]/g, "");
  return s ? parseInt(s, 10) : 0;
}

export async function uploadOrderFile(formData: FormData) {
  const user = await requireAdmin();
  const admin = createAdminClient();

  const month = String(formData.get("month") ?? "").trim(); // YYYY-MM
  const file = formData.get("file") as File | null;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) err("orders", "Tháng không hợp lệ");
  if (!file || file.size === 0) err("orders", "Chưa chọn file");

  const buffer = await file!.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
  } catch {
    err("orders", "Không đọc được file Excel. Hãy kiểm tra file có đúng định dạng .xlsx không.");
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) err("orders", "File Excel không có sheet nào");

  // Đọc header row (row 1)
  const headerRow = sheet.getRow(1);
  const colMap: Record<string, number> = {};
  headerRow.eachCell((cell: ExcelJS.Cell, colNum: number) => {
    const name = String(cell.value ?? "").trim().toLowerCase();
    colMap[name] = colNum;
  });

  // Map tên cột (flexible, case-insensitive + partial match)
  function findCol(keywords: string[]): number | undefined {
    for (const key of keywords) {
      for (const [name, idx] of Object.entries(colMap)) {
        if (name.includes(key.toLowerCase())) return idx;
      }
    }
    return undefined;
  }

  const colCompleted   = findCol(["thời gian hoàn", "hoàn thành"]);
  const colOrderCode   = findCol(["mã đh", "mã dh", "order"]);
  const colCustomer    = findCol(["khách hàng", "khach hang"]);
  const colBrand       = findCol(["brand"]);
  const colCustGroup   = findCol(["phân nhóm", "phan nhom", "nhóm kh"]);
  const colSaleChannel = findCol(["nv duyệt", "nv duyet", "kênh nv", "kenh nv"]);
  const colAmount      = findCol(["thành tiền", "thanh tien", "doanh thu"]);

  if (!colAmount) err("orders", "Không tìm thấy cột 'Thành tiền' trong file Excel");

  // Xoá dữ liệu cũ nếu có (upsert by month)
  const { data: existingFile } = await admin
    .from("order_files")
    .select("id")
    .eq("month", month)
    .maybeSingle();

  if (existingFile) {
    await admin.from("order_files").delete().eq("id", existingFile.id);
  }

  // Insert file metadata
  const { data: fileRow, error: fileErr } = await admin
    .from("order_files")
    .insert({
      month,
      original_filename: file!.name,
      row_count: 0,
      uploaded_by: user.email,
    })
    .select("id")
    .single();

  if (fileErr || !fileRow) err("orders", fileErr?.message ?? "Lỗi tạo file record");

  // Parse và insert rows theo batch
  const rows: object[] = [];
  sheet.eachRow((row: ExcelJS.Row, rowNum: number) => {
    if (rowNum === 1) return; // skip header
    const amount = parseAmount(colAmount ? row.getCell(colAmount).value : 0);
    rows.push({
      file_id: fileRow!.id,
      month,
      completed_at: colCompleted ? String(row.getCell(colCompleted).value ?? "").trim() || null : null,
      order_code:   colOrderCode   ? String(row.getCell(colOrderCode).value   ?? "").trim() || null : null,
      customer:     colCustomer    ? String(row.getCell(colCustomer).value    ?? "").trim() || null : null,
      brand:        colBrand       ? String(row.getCell(colBrand).value       ?? "").trim() || null : null,
      customer_group: colCustGroup ? String(row.getCell(colCustGroup).value   ?? "").trim() || null : null,
      sale_channel: colSaleChannel ? String(row.getCell(colSaleChannel).value ?? "").trim() || null : null,
      amount,
    });
  });

  // Insert in batches of 500
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error: insErr } = await admin.from("order_data").insert(rows.slice(i, i + BATCH));
    if (insErr) {
      await admin.from("order_files").delete().eq("id", fileRow!.id);
      err("orders", `Lỗi lưu data: ${insErr.message}`);
    }
  }

  // Update row count
  await admin.from("order_files").update({ row_count: rows.length }).eq("id", fileRow!.id);

  ok("orders", `Đã upload ${rows.length.toLocaleString("vi-VN")} đơn hàng tháng ${month}`);
}

export async function deleteOrderFile(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const { error } = await createAdminClient().from("order_files").delete().eq("id", id);
  if (error) err("orders", error.message);
  ok("orders", "Đã xoá dữ liệu đơn hàng");
}
