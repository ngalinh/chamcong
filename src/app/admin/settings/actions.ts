"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/utils";
import { PROFIT_CHANNELS, CUSTOMER_GROUPS } from "@/types/db";
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

function extraQuery(extra?: Record<string, string>): string {
  if (!extra) return "";
  return Object.entries(extra)
    .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
    .join("");
}

function ok(tab: string, msg: string, extra?: Record<string, string>): never {
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?tab=${tab}&ok=${encodeURIComponent(msg)}${extraQuery(extra)}`);
  throw new Error("unreachable"); // redirect() always throws
}

function err(tab: string, msg: string, extra?: Record<string, string>): never {
  redirect(`/admin/settings?tab=${tab}&error=${encodeURIComponent(msg)}${extraQuery(extra)}`);
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
  const apply_from = String(formData.get("apply_from") ?? "").trim(); // YYYY-MM or ''
  if (!channel_name) err("profit", "Thiếu kênh Sale");

  const payload = {
    sale_employee_id: saleRaw || null,
    cskh_employee_id: cskhRaw || null,
    sale_pct,
    cskh_pct,
  };

  let error;
  if (apply_from && id) {
    // Thay đổi có hiệu lực từ tháng cụ thể: insert/update row với effective_from = apply_from
    ({ error } = await admin
      .from("profit_channels")
      .upsert({ channel_name, effective_from: apply_from, ...payload }, { onConflict: "channel_name,effective_from" }));
  } else if (id) {
    // Update row gốc (effective_from = '')
    ({ error } = await admin.from("profit_channels").update(payload).eq("id", id));
  } else {
    ({ error } = await admin.from("profit_channels").insert({ channel_name, effective_from: "", ...payload }));
  }

  if (error) err("profit", error.message);
  ok("profit", id ? "Đã cập nhật kênh Sale" : "Đã thêm kênh Sale");
}

export async function deleteProfitChannel(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const { error } = await createAdminClient().from("profit_channels").delete().eq("id", id);
  if (error) err("profit", error.message);
  ok("profit", "Đã xoá kênh Sale");
}

// ─── profit_total_shares ──────────────────────────────────────────────────

export async function upsertProfitTotalShare(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const employee_id = String(formData.get("employee_id") ?? "").trim();
  const profit_pct = Number(formData.get("profit_pct") ?? 0) / 100;
  const apply_from = String(formData.get("apply_from") ?? "").trim();

  if (!employee_id) err("profit", "Chưa chọn tài khoản nhân viên");
  if (!Number.isFinite(profit_pct) || profit_pct < 0 || profit_pct > 1) {
    err("profit", "% profit không hợp lệ");
  }

  const { error } = await admin.from("profit_total_shares").upsert(
    { employee_id, profit_pct, effective_from: apply_from },
    { onConflict: "employee_id,effective_from" },
  );
  if (error) err("profit", error.message);
  ok("profit", "Đã cập nhật % theo tổng profit");
}

export async function deleteProfitTotalShare(formData: FormData) {
  await requireAdmin();
  const employee_id = String(formData.get("employee_id") ?? "").trim();
  const { error } = await createAdminClient()
    .from("profit_total_shares")
    .delete()
    .eq("employee_id", employee_id);
  if (error) err("profit", error.message);
  ok("profit", "Đã xoá tài khoản khỏi tổng profit");
}

// ─── profit_rules ──────────────────────────────────────────────────────────

export async function upsertProfitRule(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const brands = formData.getAll("brand").map((v) => String(v).trim()).filter(Boolean);
  const profit_pct = Number(formData.get("profit_pct") ?? 0);
  const customer_groups = formData.getAll("customer_group").map((v) => String(v).trim()).filter(Boolean);

  if (!brands.length || !customer_groups.length) err("profit", "Thiếu thông tin");
  if (!Number.isFinite(profit_pct) || profit_pct <= 0) err("profit", "% profit không hợp lệ");

  const rows = brands.flatMap((brand) =>
    customer_groups.map((cg) => ({ channel_name: "", brand, customer_group: cg, profit_pct, effective_from: "" }))
  );
  const { error } = await admin.from("profit_rules").upsert(rows, { onConflict: "channel_name,brand,customer_group,effective_from" });
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
  const apply_from = String(formData.get("apply_from") ?? "").trim(); // YYYY-MM or ''

  if (!channel_name || !brands.length || !customer_groups.length) err("profit", "Thiếu thông tin");
  if (!Number.isFinite(profit_pct) || profit_pct <= 0) err("profit", "% profit không hợp lệ");

  const effective_from = apply_from || "";

  if (!apply_from) {
    // Không có apply_from → update row gốc (effective_from='') như cũ
    await admin.from("profit_rules").delete()
      .eq("channel_name", channel_name)
      .in("brand", old_brands)
      .in("customer_group", old_cgs)
      .eq("profit_pct", old_profit_pct)
      .eq("effective_from", "");
  }

  const rows = brands.flatMap((brand) =>
    customer_groups.map((cg) => ({ channel_name, brand, customer_group: cg, profit_pct, effective_from }))
  );
  const { error } = await admin.from("profit_rules").upsert(rows, { onConflict: "channel_name,brand,customer_group,effective_from" });
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

// Normalize customer_group về đúng chuẩn (tránh lỗi hoa/thường từ Excel)
const CUSTOMER_GROUP_NORMALIZE: Record<string, string> = {
  "khách lẻ": "Khách lẻ",
  "khach le": "Khách lẻ",
  "ctv": "CTV",
  "sỉ nhỏ": "Sỉ nhỏ",
  "si nho": "Sỉ nhỏ",
  "sỉ vừa": "Sỉ vừa",
  "si vua": "Sỉ vừa",
  "sỉ to": "Sỉ to",
  "si to": "Sỉ to",
};

function normalizeCustomerGroup(raw: string | null): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return CUSTOMER_GROUP_NORMALIZE[key] ?? (raw.trim() || null);
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
  const colSaleChannel = findCol(["kênh sale", "kenh sale", "kênh bán", "kenh ban"]);
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
      customer_group: colCustGroup ? normalizeCustomerGroup(String(row.getCell(colCustGroup).value ?? "")) : null,
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

// ─── dropship_revenue ──────────────────────────────────────────────────────

export async function upsertDropshipRevenue(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const month = String(formData.get("month") ?? "").trim();
  if (!month || !/^\d{4}-\d{2}$/.test(month)) err("orders", "Tháng không hợp lệ");

  // Upsert từng ô (channel × group) có amount > 0; xoá ô = 0
  const toUpsert: object[] = [];
  const toDelete: { channel_name: string; customer_group: string }[] = [];

  for (const ch of PROFIT_CHANNELS) {
    for (const cg of CUSTOMER_GROUPS) {
      const raw = String(formData.get(`amount_${ch}_${cg}`) ?? "0").replace(/[^\d]/g, "");
      const amount = raw ? Number(raw) : 0;
      if (amount > 0) {
        toUpsert.push({ month, channel_name: ch, customer_group: cg, amount });
      } else {
        toDelete.push({ channel_name: ch, customer_group: cg });
      }
    }
  }

  if (toUpsert.length > 0) {
    const { error: upErr } = await admin
      .from("dropship_revenue")
      .upsert(toUpsert, { onConflict: "month,channel_name,customer_group" });
    if (upErr) err("orders", upErr.message, { ds_month: month });
  }

  for (const { channel_name, customer_group } of toDelete) {
    await admin.from("dropship_revenue")
      .delete()
      .eq("month", month)
      .eq("channel_name", channel_name)
      .eq("customer_group", customer_group);
  }

  ok("orders", `Đã lưu doanh thu Dropship tháng ${month}`, { ds_month: month });
}
