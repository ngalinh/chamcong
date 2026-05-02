import ExcelJS from "exceljs";
import { LEAVE_CATEGORIES, type LeaveCategory, type LeaveStatus, type OvertimeStatus, type ViolationKind, type ViolationStatus } from "@/types/db";
import { formatVN } from "@/lib/time";

export type ExportCheckIn = {
  id: string;
  kind: "in" | "out";
  checked_in_at: string;
  employee_name: string | null;
  employee_email: string | null;
  office: string | null;
  is_remote: boolean;
  late_minutes: number | null;
  early_minutes: number | null;
  distance_m: number | null;
  face_match_score: number | null;
};

export type ExportOvertime = {
  id: string;
  ot_date: string;
  start_time: string;
  end_time: string;
  hours: number;
  reason: string | null;
  status: OvertimeStatus;
  employee_name: string | null;
  employee_email: string | null;
  created_at: string;
};

export type ExportLeave = {
  id: string;
  leave_date: string;
  category: LeaveCategory;
  duration: number;
  duration_unit: "day" | "hour";
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  status: LeaveStatus;
  employee_name: string | null;
  employee_email: string | null;
  created_at: string;
};

export type ExportViolation = {
  id: string;
  kind: ViolationKind;
  report_date: string;
  total_amount: number;
  reason: string | null;
  status: ViolationStatus;
  items: { description: string; amount: number }[];
  employee_name: string | null;
  employee_email: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};

function dateOnly(iso: string) {
  return formatVN(iso, "dd/MM/yyyy");
}
function timeOnly(iso: string) {
  return formatVN(iso, "HH:mm");
}

const HEADER_STYLE: Partial<ExcelJS.Style> = {
  font: { bold: true, color: { argb: "FFFFFFFF" } },
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } },
  alignment: { vertical: "middle" },
};

function styleHeaderRow(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.eachCell((cell) => {
    cell.style = { ...cell.style, ...HEADER_STYLE };
  });
  row.height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function buildHistoryWorkbook(args: {
  checkIns: ExportCheckIn[];
  overtimes: ExportOvertime[];
  leaves: ExportLeave[];
  violations: ExportViolation[];
  includeEmployee: boolean;       // admin = true, NV = false
  rangeLabel: string;             // vd "01/05/2026 - 28/05/2026" để ghi vào meta
}): Promise<Uint8Array> {
  const { checkIns, overtimes, leaves, violations, includeEmployee, rangeLabel } = args;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Chấm công Basso";
  wb.created = new Date();
  wb.title = `Lịch sử chấm công ${rangeLabel}`;

  // ===== Sheet 1: Chấm công · OT =====
  const s1 = wb.addWorksheet("Chấm công - OT");
  const s1Cols: ExcelJS.Column[] = [
    { header: "Loại", key: "type", width: 12 } as ExcelJS.Column,
    { header: "Ngày", key: "date", width: 12 } as ExcelJS.Column,
    { header: "Giờ vào / Bắt đầu", key: "start", width: 16 } as ExcelJS.Column,
    { header: "Giờ ra / Kết thúc", key: "end", width: 16 } as ExcelJS.Column,
    { header: "Số giờ", key: "hours", width: 9 } as ExcelJS.Column,
  ];
  if (includeEmployee) {
    s1Cols.push({ header: "Nhân viên", key: "name", width: 22 } as ExcelJS.Column);
    s1Cols.push({ header: "Email", key: "email", width: 28 } as ExcelJS.Column);
  }
  s1Cols.push(
    { header: "Chi nhánh", key: "office", width: 18 } as ExcelJS.Column,
    { header: "Trạng thái", key: "status", width: 12 } as ExcelJS.Column,
    { header: "Muộn (p)", key: "late", width: 9 } as ExcelJS.Column,
    { header: "Sớm (p)", key: "early", width: 9 } as ExcelJS.Column,
    { header: "Khớp mặt", key: "face", width: 10 } as ExcelJS.Column,
    { header: "Khoảng cách (m)", key: "distance", width: 14 } as ExcelJS.Column,
    { header: "Lý do / Ghi chú", key: "note", width: 40 } as ExcelJS.Column,
  );
  s1.columns = s1Cols;

  type Row1 = Record<string, unknown>;
  const rows1: { sortKey: string; row: Row1 }[] = [];
  for (const ci of checkIns) {
    rows1.push({
      sortKey: ci.checked_in_at,
      row: {
        type: ci.kind === "in" ? "Check-in" : "Check-out",
        date: dateOnly(ci.checked_in_at),
        start: ci.kind === "in" ? timeOnly(ci.checked_in_at) : "",
        end:   ci.kind === "out" ? timeOnly(ci.checked_in_at) : "",
        hours: "",
        name:  ci.employee_name ?? "",
        email: ci.employee_email ?? "",
        office: (ci.is_remote ? "[Online] " : "") + (ci.office ?? ""),
        status: "—",
        late:  ci.late_minutes ?? "",
        early: ci.early_minutes ?? "",
        face:  ci.face_match_score != null ? ci.face_match_score.toFixed(2) : "",
        distance: ci.distance_m != null ? Math.round(ci.distance_m) : "",
        note: "",
      },
    });
  }
  for (const ot of overtimes) {
    rows1.push({
      sortKey: ot.ot_date + "T" + ot.start_time,
      row: {
        type: "OT",
        date: formatVN(ot.ot_date + "T00:00:00+07:00", "dd/MM/yyyy"),
        start: ot.start_time.slice(0, 5),
        end:   ot.end_time.slice(0, 5),
        hours: ot.hours,
        name:  ot.employee_name ?? "",
        email: ot.employee_email ?? "",
        office: "",
        status: STATUS_LABEL[ot.status] ?? ot.status,
        late: "", early: "", face: "", distance: "",
        note: ot.reason ?? "",
      },
    });
  }
  rows1.sort((a, b) => b.sortKey.localeCompare(a.sortKey)); // desc
  for (const r of rows1) s1.addRow(r.row);
  styleHeaderRow(s1);

  // ===== Sheet 2: Xin nghỉ =====
  const s2 = wb.addWorksheet("Xin nghỉ");
  const s2Cols: ExcelJS.Column[] = [
    { header: "Ngày nghỉ", key: "date", width: 12 } as ExcelJS.Column,
    { header: "Loại", key: "category", width: 22 } as ExcelJS.Column,
    { header: "Thời gian", key: "duration", width: 14 } as ExcelJS.Column,
    { header: "Giờ bắt đầu", key: "start", width: 12 } as ExcelJS.Column,
    { header: "Giờ kết thúc", key: "end", width: 12 } as ExcelJS.Column,
  ];
  if (includeEmployee) {
    s2Cols.push({ header: "Nhân viên", key: "name", width: 22 } as ExcelJS.Column);
    s2Cols.push({ header: "Email", key: "email", width: 28 } as ExcelJS.Column);
  }
  s2Cols.push(
    { header: "Trạng thái", key: "status", width: 12 } as ExcelJS.Column,
    { header: "Lý do", key: "reason", width: 40 } as ExcelJS.Column,
    { header: "Ngày nộp", key: "createdAt", width: 16 } as ExcelJS.Column,
  );
  s2.columns = s2Cols;
  const sortedLeaves = [...leaves].sort((a, b) => (b.created_at).localeCompare(a.created_at));
  for (const lv of sortedLeaves) {
    s2.addRow({
      date: formatVN(lv.leave_date + "T00:00:00+07:00", "dd/MM/yyyy"),
      category: LEAVE_CATEGORIES[lv.category] ?? lv.category,
      duration: `${lv.duration} ${lv.duration_unit === "day" ? "ngày" : "giờ"}`,
      start: lv.start_time?.slice(0, 5) ?? "",
      end:   lv.end_time?.slice(0, 5) ?? "",
      name:  lv.employee_name ?? "",
      email: lv.employee_email ?? "",
      status: STATUS_LABEL[lv.status] ?? lv.status,
      reason: lv.reason ?? "",
      createdAt: formatVN(lv.created_at, "dd/MM/yyyy HH:mm"),
    });
  }
  styleHeaderRow(s2);

  // ===== Sheet 3: Thưởng / Vi phạm =====
  const s3 = wb.addWorksheet("Thưởng - Vi phạm");
  const s3Cols: ExcelJS.Column[] = [
    { header: "Loại", key: "kind", width: 10 } as ExcelJS.Column,
    { header: "Ngày", key: "date", width: 12 } as ExcelJS.Column,
  ];
  if (includeEmployee) {
    s3Cols.push({ header: "Nhân viên", key: "name", width: 22 } as ExcelJS.Column);
    s3Cols.push({ header: "Email", key: "email", width: 28 } as ExcelJS.Column);
  }
  s3Cols.push(
    { header: "Mục", key: "description", width: 40 } as ExcelJS.Column,
    { header: "Số tiền (VND)", key: "amount", width: 16 } as ExcelJS.Column,
    { header: "Tổng đơn (VND)", key: "totalAmount", width: 16 } as ExcelJS.Column,
    { header: "Trạng thái", key: "status", width: 12 } as ExcelJS.Column,
    { header: "Ghi chú", key: "reason", width: 40 } as ExcelJS.Column,
    { header: "Ngày nộp", key: "createdAt", width: 16 } as ExcelJS.Column,
  );
  s3.columns = s3Cols;
  const sortedViols = [...violations].sort((a, b) => (b.created_at).localeCompare(a.created_at));
  for (const v of sortedViols) {
    const baseRow = {
      kind: v.kind === "bonus" ? "Thưởng" : "Vi phạm",
      date: formatVN(v.report_date + "T00:00:00+07:00", "dd/MM/yyyy"),
      name:  v.employee_name ?? "",
      email: v.employee_email ?? "",
      totalAmount: Number(v.total_amount),
      status: STATUS_LABEL[v.status] ?? v.status,
      reason: v.reason ?? "",
      createdAt: formatVN(v.created_at, "dd/MM/yyyy HH:mm"),
    };
    if (v.items.length === 0) {
      s3.addRow({ ...baseRow, description: "—", amount: 0 });
    } else {
      for (const it of v.items) {
        s3.addRow({ ...baseRow, description: it.description, amount: Number(it.amount) });
      }
    }
  }
  styleHeaderRow(s3);
  // Format số tiền cột "Số tiền" + "Tổng đơn" có dấu phẩy
  for (const colKey of ["amount", "totalAmount"]) {
    const col = s3.getColumn(colKey);
    col.numFmt = "#,##0";
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
