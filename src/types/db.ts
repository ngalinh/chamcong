export type Office = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_m: number;
  timezone: string;
  work_start_time: string; // "HH:MM:SS"
  work_end_time: string;   // "HH:MM:SS"
  is_active: boolean;
  is_remote: boolean;
  approver_email: string | null;
  created_at: string;
};

export type EmploymentType = "fulltime" | "parttime";

export type WorkShift = { start: string; end: string };  // "HH:MM:SS"

export type Employee = {
  id: string;
  user_id: string | null;
  email: string;
  name: string;
  reference_photo: string | null;
  face_descriptor: number[] | null;
  home_office_id: string | null;
  is_admin: boolean;
  is_active: boolean;
  employment_type: EmploymentType;
  salary: number;
  hourly_rate: number;
  overtime_rate: number;
  leave_balance: number;
  last_accrual_month: string | null;
  work_start_time: string | null;  // legacy single-shift override
  work_end_time: string | null;
  work_shifts: WorkShift[];        // multi-shift, ưu tiên hơn work_start/end
  reminder_shift_indices: number[]; // ca muốn nhận push reminder; [] = tất cả
  ot_fixed_salary: number | null;  // lương OT cố định/tháng
  salary_pending: number | null;               // lương cứng chờ áp dụng
  ot_fixed_salary_pending: number | null;      // lương OT chờ áp dụng
  salary_pending_month: string | null;         // YYYY-MM — tháng bắt đầu áp dụng salary_pending
  ot_fixed_salary_pending_month: string | null; // YYYY-MM — tháng bắt đầu áp dụng ot_fixed_salary_pending
  exempt_absence: boolean;         // true = không tính vắng không phép
  created_at: string;
};

export type ProfitChannel = {
  id: string;
  channel_name: string;
  sale_employee_id: string | null;
  cskh_employee_id: string | null;
  sale_pct: number;
  cskh_pct: number;
  effective_from: string; // YYYY-MM, '' = luôn áp dụng
  created_at: string;
};

export type ProfitRule = {
  id: string;
  channel_name: string;
  brand: string;
  customer_group: string;
  profit_pct: number;
  effective_from: string; // YYYY-MM, '' = luôn áp dụng
  created_at: string;
};

export type OrderFile = {
  id: string;
  month: string;
  original_filename: string;
  row_count: number;
  uploaded_by: string | null;
  created_at: string;
};

export const PROFIT_CHANNELS = ["Linh Dương", "Linh Thảo", "Kênh CO", "ShipUS"] as const;
export type ProfitChannelName = typeof PROFIT_CHANNELS[number];

export const PROFIT_BRANDS = ["Asale", "Basso", "ShipUS", "Checkout", "Stock", "Dropship"] as const;
export const CUSTOMER_GROUPS = ["Khách lẻ", "CTV", "Sỉ nhỏ", "Sỉ vừa", "Sỉ to"] as const;
export const PROFIT_PCTS = [0.005, 0.01, 0.015, 0.02] as const;

export const LEAVE_CATEGORIES = {
  online_rain:  "Làm online - trời mưa",
  online_wfh:   "Làm online - WFH",
  online_paid:  "Làm online - trừ phép",   // deprecated — giữ để hiển thị đơn cũ
  leave_hourly: "Nghỉ theo giờ",
  leave_paid:   "Nghỉ theo ngày",
  leave_unpaid: "Xin nghỉ không lương",     // deprecated — giữ để hiển thị đơn cũ
} as const;

export type LeaveCategory = keyof typeof LEAVE_CATEGORIES;

// Chỉ những category còn dùng trong form NV (loại bỏ deprecated).
export const ACTIVE_LEAVE_CATEGORIES: LeaveCategory[] = [
  "online_rain",
  "online_wfh",
  "leave_hourly",
  "leave_paid",
];

export type DurationUnit = "day" | "hour";

export type LeaveStatus = "pending" | "approved" | "rejected";

export type LeaveRequest = {
  id: string;
  employee_id: string;
  leave_date: string;
  category: LeaveCategory;
  duration: number;
  duration_unit: DurationUnit;
  reason: string | null;
  status: LeaveStatus;
  start_time: string | null;  // "HH:MM:SS" — chỉ có khi category = "leave_hourly"
  end_time: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
};

export type Alert = {
  id: string;
  employee_id: string | null;
  alert_date: string;
  kind: string;
  message: string;
  resolved: boolean;
  created_at: string;
};

export type CheckInKind = "in" | "out";

export type CheckIn = {
  id: string;
  employee_id: string;
  office_id: string | null;
  kind: CheckInKind;
  checked_in_at: string;
  selfie_path: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_m: number | null;
  face_match_score: number | null;
  liveness_passed: boolean | null;
  late_minutes: number | null;
  early_minutes: number | null;
  user_agent: string | null;
  edited_at: string | null;
  edited_by: string | null;
  edit_reason: string | null;
  created_by_admin_email: string | null;
  created_at: string;
};

export type OvertimeStatus = "pending" | "approved" | "rejected";

export type OvertimeRequest = {
  id: string;
  employee_id: string;
  ot_date: string;        // YYYY-MM-DD
  start_time: string;     // "HH:MM:SS"
  end_time: string;       // "HH:MM:SS"
  hours: number;
  reason: string | null;
  status: OvertimeStatus;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
};

export type ViolationStatus = "pending" | "approved" | "rejected";
export type ViolationKind = "bonus" | "violation";

export type ViolationReport = {
  id: string;
  employee_id: string;
  kind: ViolationKind;
  report_date: string;
  total_amount: number;
  reason: string | null;
  status: ViolationStatus;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
};

export type ViolationItem = {
  id: string;
  report_id: string;
  description: string;
  amount: number;
  position: number;
  created_at: string;
};
