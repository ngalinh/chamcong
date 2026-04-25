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
  created_at: string;
};

export const LEAVE_CATEGORIES = {
  online_rain:  "Làm online - trời mưa",
  online_wfh:   "Làm online - WFH",
  online_paid:  "Làm online - trừ phép",
  leave_hourly: "Nghỉ theo giờ",
  leave_paid:   "Xin nghỉ trừ phép",
  leave_unpaid: "Xin nghỉ không lương",
} as const;

export type LeaveCategory = keyof typeof LEAVE_CATEGORIES;

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

export type ViolationReport = {
  id: string;
  employee_id: string;
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
