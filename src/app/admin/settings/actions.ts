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
  const sale_pct = Number(formData.get("sale_pct") ?? 0) / 100;
  const cskh_pct = Number(formData.get("cskh_pct") ?? 0) / 100;
  if (!channel_name) err("profit", "Thiếu kênh NV");

  const updatePayload = {
    sale_employee_id: saleRaw || null,
    cskh_employee_id: cskhRaw || null,
    sale_pct,
    cskh_pct,
  };

  const { error } = id
    ? await admin.from("profit_channels").update(updatePayload).eq("id", id)
    : await admin.from("profit_channels").insert({ channel_name, ...updatePayload });

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
  const channel_name = String(formData.get("channel_name") ?? "").trim();
  const brands = formData.getAll("brand").map((v) => String(v).trim()).filter(Boolean);
  const profit_pct = Number(formData.get("profit_pct") ?? 0);
  const customer_groups = formData.getAll("customer_group").map((v) => String(v).trim()).filter(Boolean);

  if (!channel_name || !brands.length || !customer_groups.length) err("profit", "Thiếu thông tin");
  if (!Number.isFinite(profit_pct) || profit_pct <= 0) err("profit", "% profit không hợp lệ");

  const rows = brands.flatMap((brand) =>
    customer_groups.map((cg) => ({ channel_name, brand, customer_group: cg, profit_pct }))
  );
  const { error } = await admin.from("profit_rules").upsert(rows, { onConflict: "channel_name,brand,customer_group" });
  if (error) err("profit", error.message);
  ok("profit", `Đã thêm ${rows.length} rule`);
}

export async function deleteProfitRule(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const { error } = await createAdminClient().from("profit_rules").delete().eq("id", id);
  if (error) err("profit", error.message);
  ok("profit", "Đã xoá rule");
}

// edit_key = "channel_name||profit_pct||brands_tilde||cgs_tilde"
export async function upsertProfitRuleGroup(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const editKey = String(formData.get("edit_key") ?? "");
  const parts = editKey.split("||");
  const channel_name = (parts[0] ?? "").trim();
  const old_profit_pct = Number(parts[1] ?? 0);
  const old_brands = (parts[2] ?? "").split("~").map((s) => s.trim()).filter(Boolean);
  const old_cgs = (parts[3] ?? "").split("~").map((s) => s.trim()).filter(Boolean);
  const profit_pct = Number(formData.get("profit_pct") ?? 0);
  const brands = formData.getAll("brand").map((v) => String(v).trim()).filter(Boolean);
  const customer_groups = formData.getAll("customer_group").map((v) => String(v).trim()).filter(Boolean);

  if (!channel_name || !brands.length || !customer_groups.length) err("profit", "Thiếu thông tin");
  if (!Number.isFinite(profit_pct) || profit_pct <= 0) err("profit", "% profit không hợp lệ");

  // Xoá toàn bộ rows cũ của group này (old brands × old cgs)
  await admin.from("profit_rules").delete()
    .eq("channel_name", channel_name)
    .in("brand", old_brands)
    .in("customer_group", old_cgs)
    .eq("profit_pct", old_profit_pct);

  const rows = brands.flatMap((brand) =>
    customer_groups.map((cg) => ({ channel_name, brand, customer_group: cg, profit_pct }))
  );
  const { error } = await admin.from("profit_rules").upsert(rows, { onConflict: "channel_name,brand,customer_group" });
  if (error) err("profit", error.message);
  ok("profit", "Đã cập nhật rule");
}

export async function deleteProfitRuleGroup(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const editKey = String(formData.get("edit_key") ?? "");
  const parts = editKey.split("||");
  const channel_name = (parts[0] ?? "").trim();
  const profit_pct = Number(parts[1] ?? 0);
  const brands = (parts[2] ?? "").split("~").map((s) => s.trim()).filter(Boolean);
  const cgs = (parts[3] ?? "").split("~").map((s) => s.trim()).filter(Boolean);

  const { error } = await admin.from("profit_rules").delete()
    .eq("channel_name", channel_name)
    .in("brand", brands)
    .in("customer_group", cgs)
    .eq("profit_pct", profit_pct);
  if (error) err("profit", error.message);
  ok("profit", "Đã xoá rule");
}

// ─── order files ───────────────────────────────────────────────────────────

// Map tên NV trong cột "NV duyệt đơn" → tên kênh trong bảng profit_rules
const CHANNEL_NAME_MAP: Record<string, string> = {
  "thư": "ShipUS",
};

function normalizeChannel(raw: string | null): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  for (const [pattern, channel] of Object.entries(CHANNEL_NAME_MAP)) {
    if (key === pattern || key.includes(pattern)) return channel;
  }
  return raw.trim() || null;
}

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

  // Tìm header row: scan tối đa 10 row đầu, chọn row đầu tiên chứa keyword cột bắt buộc
  const HEADER_KEYWORDS = ["thành tiền", "thanh tien", "brand", "khách hàng", "mã đh", "nv duyệt"];
  let headerRowNum = 1;
  for (let i = 1; i <= 10; i++) {
    const row = sheet.getRow(i);
    let found = false;
    row.eachCell((cell: ExcelJS.Cell) => {
      if (found) return;
      const val = String(cell.value ?? "").trim().toLowerCase();
      if (HEADER_KEYWORDS.some((kw) => val.includes(kw))) found = true;
    });
    if (found) { headerRowNum = i; break; }
  }
  const headerRow = sheet.getRow(headerRowNum);
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
  const colSaleChannel = findCol(["nhân viên", "nhan vien", "nv duyệt", "nv duyet", "kênh nv", "kenh nv"]);
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
    if (rowNum <= headerRowNum) return; // skip title + header rows
    const amount = parseAmount(colAmount ? row.getCell(colAmount).value : 0);
    rows.push({
      file_id: fileRow!.id,
      month,
      completed_at: colCompleted ? String(row.getCell(colCompleted).value ?? "").trim() || null : null,
      order_code:   colOrderCode   ? String(row.getCell(colOrderCode).value   ?? "").trim() || null : null,
      customer:     colCustomer    ? String(row.getCell(colCustomer).value    ?? "").trim() || null : null,
      brand:        colBrand       ? String(row.getCell(colBrand).value       ?? "").trim() || null : null,
      customer_group: colCustGroup ? String(row.getCell(colCustGroup).value   ?? "").trim() || null : null,
      sale_channel: colSaleChannel ? normalizeChannel(String(row.getCell(colSaleChannel).value ?? "")) : null,
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

// ─── dropship_revenue ──────────────────────────────────────────────────────

export async function upsertDropshipRevenue(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const month = String(formData.get("month") ?? "").trim();
  if (!month || !/^\d{4}-\d{2}$/.test(month)) err("orders", "Tháng không hợp lệ");

  const { PROFIT_CHANNELS, CUSTOMER_GROUPS } = await import("@/types/db");
  const now = new Date().toISOString();

  // Upsert từng ô (channel × group) có amount > 0; xoá ô = 0
  const toUpsert: object[] = [];
  const toDelete: { channel_name: string; customer_group: string }[] = [];

  for (const ch of PROFIT_CHANNELS) {
    for (const cg of CUSTOMER_GROUPS) {
      const raw = String(formData.get(`amount_${ch}_${cg}`) ?? "0").replace(/[^\d]/g, "");
      const amount = raw ? Number(raw) : 0;
      if (amount > 0) {
        toUpsert.push({ month, channel_name: ch, customer_group: cg, amount, updated_at: now });
      } else {
        toDelete.push({ channel_name: ch, customer_group: cg });
      }
    }
  }

  if (toUpsert.length > 0) {
    const { error: upErr } = await admin
      .from("dropship_revenue")
      .upsert(toUpsert, { onConflict: "month,channel_name,customer_group" });
    if (upErr) err("orders", upErr.message);
  }

  for (const { channel_name, customer_group } of toDelete) {
    await admin.from("dropship_revenue")
      .delete()
      .eq("month", month)
      .eq("channel_name", channel_name)
      .eq("customer_group", customer_group);
  }

  ok("orders", `Đã lưu doanh thu Dropship tháng ${month}`);
}
