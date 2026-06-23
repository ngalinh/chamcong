"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { Employee, Office } from "@/types/db";
import {
  Users,
  Wifi,
  Building2,
  Check,
  CircleSlash,
  Search,
  Briefcase,
  ExternalLink,
  Pencil,
} from "lucide-react";
import EmployeeOfficeSelect from "@/components/EmployeeOfficeSelect";
import { ChangeEmployeePhoto } from "@/components/ChangeEmployeePhoto";
import { DeleteEmployeeButton } from "@/components/DeleteEmployeeButton";
import EmployeePayrollEditor from "@/components/EmployeePayrollEditor";
import EmployeeWorkHoursEditor from "@/components/EmployeeWorkHoursEditor";
import OtFixedSalaryEditor from "@/components/OtFixedSalaryEditor";

type Action = (formData: FormData) => Promise<void>;

type Props = {
  employees: Employee[];
  offices: Office[];
  meEmail: string;
  actions: {
    deleteEmployee: Action;
    updateEmploymentType: Action;
    updateEmployeePayroll: Action;
    updateOtFixedSalary: Action;
    updateEmployeeWorkHours: Action;
    updateEmployeeOffice: Action;
  };
};

export function EmployeesTable({ employees, offices, meEmail, actions }: Props) {
  const [q, setQ] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const officeMap = useMemo(
    () => new Map<string, Office>(offices.map((o) => [o.id, o])),
    [offices],
  );

  const stats = useMemo(() => {
    const total = employees.length;
    const online = employees.filter((e) => {
      if (!e.home_office_id) return false;
      return officeMap.get(e.home_office_id)?.is_remote === true;
    }).length;
    const perOffice = offices
      .filter((o) => !o.is_remote)
      .map((o) => ({
        id: o.id,
        name: o.name,
        count: employees.filter((e) => e.home_office_id === o.id).length,
      }))
      .filter((o) => o.count > 0);
    return { total, online, perOffice };
  }, [employees, offices, officeMap]);

  const filtered = useMemo(() => {
    const lower = q.toLowerCase();
    return employees.filter((e) => {
      if (q && !e.name.toLowerCase().includes(lower) && !e.email.toLowerCase().includes(lower))
        return false;
      if (branchFilter !== "all") {
        if (branchFilter === "none") {
          if (e.home_office_id) return false;
        } else if (branchFilter === "online") {
          const o = e.home_office_id ? officeMap.get(e.home_office_id) : undefined;
          if (!o?.is_remote) return false;
        } else {
          if (e.home_office_id !== branchFilter) return false;
        }
      }
      if (typeFilter !== "all" && e.employment_type !== typeFilter) return false;
      return true;
    });
  }, [employees, q, branchFilter, typeFilter, officeMap]);

  const officeOptions = offices.map((o) => ({ id: o.id, name: o.name, is_remote: o.is_remote }));

  return (
    <>
      {/* Stats chips */}
      <div className="flex gap-3 flex-wrap">
        <StatChip icon={<Users size={12} />} label="Tổng nhân viên">
          <span className="text-2xl font-extrabold tabular-nums tracking-tight">{stats.total}</span>
        </StatChip>
        <StatChip icon={<Wifi size={12} />} label="Làm online">
          <span className="text-2xl font-extrabold tabular-nums tracking-tight">{stats.online}</span>
        </StatChip>
        {stats.perOffice.map((o: { id: string; name: string; count: number }) => (
          <StatChip key={o.id} icon={<Building2 size={12} />} label={o.name}>
            <span className="text-2xl font-extrabold tabular-nums tracking-tight">{o.count}</span>
          </StatChip>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-[360px]">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
          />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên hoặc email…"
            className="h-10 w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
          />
        </div>
        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="h-10 rounded-xl border border-neutral-200 bg-white pl-3 pr-8 text-sm outline-none focus:border-indigo-400 appearance-none cursor-pointer"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239aa1a9' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 8px center",
          }}
        >
          <option value="all">Tất cả chi nhánh</option>
          <option value="online">🌐 Làm online</option>
          {offices
            .filter((o) => !o.is_remote)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          <option value="none">Chưa có chi nhánh</option>
        </select>
        <div className="inline-flex bg-neutral-100/80 rounded-xl p-1 gap-0.5">
          {(
            [
              ["all", "Tất cả"],
              ["fulltime", "Fulltime"],
              ["parttime", "Parttime"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setTypeFilter(v)}
              className={`h-8 px-3.5 rounded-lg text-[12.5px] font-semibold transition ${
                typeFilter === v
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {filtered.map((e) => {
          const office = e.home_office_id ? officeMap.get(e.home_office_id) : undefined;
          const canDelete = e.email !== meEmail;
          const shifts = Array.isArray(e.work_shifts) && e.work_shifts.length > 0
            ? (e.work_shifts as { start: string; end: string }[])
            : null;
          return (
            <div key={e.id} className="bg-white/85 backdrop-blur-sm border border-neutral-200/70 rounded-2xl shadow-sm overflow-hidden">
              {/* Card header: avatar + identity */}
              <div className="flex items-start gap-3 px-4 pt-4 pb-3">
                <Avatar name={e.name} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm tracking-tight flex items-center gap-1.5 flex-wrap">
                    <span>{e.name}</span>
                    {e.is_admin && (
                      <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-neutral-900 text-white">
                        Admin
                      </span>
                    )}
                  </div>
                  <div className="text-[11.5px] text-neutral-500 mt-0.5 truncate">{e.email}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {e.face_descriptor ? (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
                        <Check size={10} /> Đã enroll
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700">
                        <CircleSlash size={10} /> Chưa enroll
                      </span>
                    )}
                    {office?.is_remote && (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700">
                        <Wifi size={10} /> Làm online
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-neutral-100 divide-y divide-neutral-100">
                {/* Loại HĐ + Chi nhánh */}
                <div className="px-4 py-3 space-y-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 w-20 shrink-0">Loại HĐ</span>
                    <div className="inline-flex rounded-lg bg-neutral-100 p-0.5 gap-0.5">
                      <form action={actions.updateEmploymentType}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="employment_type" value="fulltime" />
                        <button
                          type="submit"
                          className={`px-2.5 h-6 rounded-md text-[11px] font-medium transition inline-flex items-center gap-1 ${
                            e.employment_type !== "parttime"
                              ? "bg-white text-neutral-900 shadow-sm"
                              : "text-neutral-500 hover:text-neutral-700"
                          }`}
                        >
                          <Briefcase size={10} /> Fulltime
                        </button>
                      </form>
                      <form action={actions.updateEmploymentType}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="employment_type" value="parttime" />
                        <button
                          type="submit"
                          className={`px-2.5 h-6 rounded-md text-[11px] font-medium transition ${
                            e.employment_type === "parttime"
                              ? "bg-white text-neutral-900 shadow-sm"
                              : "text-neutral-500 hover:text-neutral-700"
                          }`}
                        >
                          Parttime
                        </button>
                      </form>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 w-20 shrink-0 pt-1.5">Chi nhánh</span>
                    <div className="flex-1 space-y-1">
                      <EmployeeOfficeSelect
                        employeeId={e.id}
                        currentOfficeId={e.home_office_id}
                        offices={officeOptions}
                        action={actions.updateEmployeeOffice}
                      />
                      {shifts ? (
                        <div className="flex flex-col gap-0.5 mt-1">
                          {shifts.map((s, i) => (
                            <div key={i} className="text-[10.5px] text-violet-700 flex items-center gap-1">
                              <span className="font-semibold">
                                {shifts.length > 1 ? `Ca ${i + 1}:` : "Giờ riêng:"}
                              </span>
                              {s.start.slice(0, 5)} → {s.end.slice(0, 5)}
                            </div>
                          ))}
                        </div>
                      ) : e.work_start_time ? (
                        <div className="text-[10.5px] text-violet-700 flex items-center gap-1 mt-1">
                          <span className="font-semibold">Giờ riêng:</span>
                          {e.work_start_time.slice(0, 5)} → {e.work_end_time?.slice(0, 5)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Lương */}
                <div className="px-4 py-3 space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-1">
                    Lương cứng / OT <Pencil size={9} className="opacity-50" />
                  </div>
                  <EmployeePayrollEditor
                    employeeId={e.id}
                    initialEmploymentType={
                      (e.employment_type ?? "fulltime") as "fulltime" | "parttime"
                    }
                    initialSalary={Number(e.salary ?? 0)}
                    initialHourlyRate={Number(e.hourly_rate ?? 0)}
                    initialOvertimeRate={Number(e.overtime_rate ?? 0)}
                    initialSalaryPending={e.salary_pending ?? null}
                    initialSalaryPendingMonth={e.salary_pending_month ?? null}
                    action={actions.updateEmployeePayroll}
                  />
                  {e.employment_type !== "parttime" && (
                    <OtFixedSalaryEditor
                      employeeId={e.id}
                      initialValue={e.ot_fixed_salary ?? null}
                      initialOtPending={e.ot_fixed_salary_pending ?? null}
                      initialOtSalaryPendingMonth={e.ot_fixed_salary_pending_month ?? null}
                      action={actions.updateOtFixedSalary}
                    />
                  )}
                </div>

                {/* Thao tác */}
                <div className="px-4 py-3 flex flex-wrap gap-2">
                  <Link
                    href={`/admin/employees/${e.id}/payroll`}
                    className="h-8 px-3 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-[12.5px] font-semibold hover:bg-indigo-100 inline-flex items-center gap-1.5 transition"
                  >
                    <ExternalLink size={13} /> Xem lương
                  </Link>
                  <EmployeeWorkHoursEditor
                    employeeId={e.id}
                    initialShifts={
                      Array.isArray(e.work_shifts)
                        ? (e.work_shifts as { start: string; end: string }[])
                        : []
                    }
                    initialStart={e.work_start_time ?? null}
                    initialEnd={e.work_end_time ?? null}
                    officeStart={office?.work_start_time ?? null}
                    officeEnd={office?.work_end_time ?? null}
                    initialReminderIndices={
                      Array.isArray(e.reminder_shift_indices)
                        ? (e.reminder_shift_indices as number[])
                        : []
                    }
                    action={actions.updateEmployeeWorkHours}
                  />
                  {e.face_descriptor && (
                    <ChangeEmployeePhoto employeeId={e.id} employeeName={e.name} />
                  )}
                  {canDelete && (
                    <DeleteEmployeeButton
                      employeeId={e.id}
                      employeeName={e.name}
                      action={actions.deleteEmployee}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div className="text-[11.5px] text-neutral-500 text-center py-1">
          Hiển thị <b className="text-neutral-700">{filtered.length}</b> / {employees.length} nhân viên
          {q || branchFilter !== "all" || typeFilter !== "all" ? " (đang lọc)" : ""}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white/85 backdrop-blur-sm border border-neutral-200/70 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-neutral-100">
              <th className="text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400 px-4 py-3 bg-neutral-50/60">
                Nhân viên
              </th>
              <th className="text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400 px-4 py-3 bg-neutral-50/60">
                Loại HĐ
              </th>
              <th className="text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400 px-4 py-3 bg-neutral-50/60">
                Chi nhánh
              </th>
              <th className="text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400 px-4 py-3 bg-neutral-50/60">
                Lương cứng / OT{" "}
                <Pencil size={10} className="inline-block opacity-50 align-middle" />
              </th>
              <th className="text-left text-[10px] font-bold uppercase tracking-widest text-neutral-400 px-4 py-3 bg-neutral-50/60">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const office = e.home_office_id ? officeMap.get(e.home_office_id) : undefined;
              const canDelete = e.email !== meEmail;
              return (
                <tr
                  key={e.id}
                  className="border-b border-neutral-100 last:border-0 hover:bg-indigo-50/30 transition-colors"
                >
                  {/* Col 1: Nhân viên */}
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-start gap-3 min-w-[220px]">
                      <Avatar name={e.name} />
                      <div className="min-w-0">
                        <div className="font-semibold text-[13.5px] tracking-tight flex items-center gap-1.5 flex-wrap">
                          <span>{e.name}</span>
                          {e.is_admin && (
                            <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-neutral-900 text-white">
                              Admin
                            </span>
                          )}
                        </div>
                        <div className="text-[11.5px] text-neutral-500 mt-0.5 truncate max-w-[180px]">
                          {e.email}
                        </div>
                        <div className="mt-1.5">
                          {e.face_descriptor ? (
                            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
                              <Check size={10} /> Đã enroll
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700">
                              <CircleSlash size={10} /> Chưa enroll
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Col 2: Loại HĐ */}
                  <td className="px-4 py-3 align-middle">
                    <div className="flex flex-col gap-1.5 items-start">
                      <div className="inline-flex rounded-lg bg-neutral-100 p-0.5 gap-0.5">
                        <form action={actions.updateEmploymentType}>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="employment_type" value="fulltime" />
                          <button
                            type="submit"
                            className={`px-2.5 h-6 rounded-md text-[11px] font-medium transition inline-flex items-center gap-1 ${
                              e.employment_type !== "parttime"
                                ? "bg-white text-neutral-900 shadow-sm"
                                : "text-neutral-500 hover:text-neutral-700"
                            }`}
                          >
                            <Briefcase size={10} /> Fulltime
                          </button>
                        </form>
                        <form action={actions.updateEmploymentType}>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="employment_type" value="parttime" />
                          <button
                            type="submit"
                            className={`px-2.5 h-6 rounded-md text-[11px] font-medium transition ${
                              e.employment_type === "parttime"
                                ? "bg-white text-neutral-900 shadow-sm"
                                : "text-neutral-500 hover:text-neutral-700"
                            }`}
                          >
                            Parttime
                          </button>
                        </form>
                      </div>
                      {office?.is_remote && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700">
                          <Wifi size={10} /> Làm online
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Col 3: Chi nhánh */}
                  <td className="px-4 py-3 align-middle">
                    <div className="flex flex-col gap-1.5 items-start">
                      <div className="w-44">
                        <EmployeeOfficeSelect
                          employeeId={e.id}
                          currentOfficeId={e.home_office_id}
                          offices={officeOptions}
                          action={actions.updateEmployeeOffice}
                        />
                      </div>
                      {(() => {
                        const shifts = Array.isArray(e.work_shifts) && e.work_shifts.length > 0
                          ? (e.work_shifts as { start: string; end: string }[])
                          : null;
                        if (shifts) return (
                          <div className="flex flex-col gap-0.5">
                            {shifts.map((s, i) => (
                              <div key={i} className="text-[10.5px] text-violet-700 flex items-center gap-1">
                                <span className="font-semibold">
                                  {shifts.length > 1 ? `Ca ${i + 1}:` : "Giờ riêng:"}
                                </span>
                                {s.start.slice(0, 5)} → {s.end.slice(0, 5)}
                              </div>
                            ))}
                          </div>
                        );
                        if (e.work_start_time) return (
                          <div className="text-[10.5px] text-violet-700 flex items-center gap-1">
                            <span className="font-semibold">Giờ riêng:</span>
                            {e.work_start_time.slice(0, 5)} → {e.work_end_time?.slice(0, 5)}
                          </div>
                        );
                        return null;
                      })()}
                    </div>
                  </td>

                  {/* Col 4: Lương */}
                  <td className="px-4 py-3 align-middle">
                    <div className="flex flex-col gap-2 items-start">
                      <EmployeePayrollEditor
                        employeeId={e.id}
                        initialEmploymentType={
                          (e.employment_type ?? "fulltime") as "fulltime" | "parttime"
                        }
                        initialSalary={Number(e.salary ?? 0)}
                        initialHourlyRate={Number(e.hourly_rate ?? 0)}
                        initialOvertimeRate={Number(e.overtime_rate ?? 0)}
                        initialSalaryPending={e.salary_pending ?? null}
                        initialSalaryPendingMonth={e.salary_pending_month ?? null}
                        action={actions.updateEmployeePayroll}
                      />
                      {e.employment_type !== "parttime" && (
                        <OtFixedSalaryEditor
                          employeeId={e.id}
                          initialValue={e.ot_fixed_salary ?? null}
                          initialOtPending={e.ot_fixed_salary_pending ?? null}
                          initialOtSalaryPendingMonth={e.ot_fixed_salary_pending_month ?? null}
                          action={actions.updateOtFixedSalary}
                        />
                      )}
                    </div>
                  </td>

                  {/* Col 5: Thao tác */}
                  <td className="px-4 py-3 align-middle">
                    <div className="flex flex-col gap-2 items-start">
                      <Link
                        href={`/admin/employees/${e.id}/payroll`}
                        className="h-8 px-3 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-[12.5px] font-semibold hover:bg-indigo-100 inline-flex items-center gap-1.5 shrink-0 transition"
                      >
                        <ExternalLink size={13} /> Xem lương
                      </Link>
                      <div className="flex items-center gap-1.5">
                        <EmployeeWorkHoursEditor
                          employeeId={e.id}
                          initialShifts={
                            Array.isArray(e.work_shifts)
                              ? (e.work_shifts as { start: string; end: string }[])
                              : []
                          }
                          initialStart={e.work_start_time ?? null}
                          initialEnd={e.work_end_time ?? null}
                          officeStart={office?.work_start_time ?? null}
                          officeEnd={office?.work_end_time ?? null}
                          initialReminderIndices={
                            Array.isArray(e.reminder_shift_indices)
                              ? (e.reminder_shift_indices as number[])
                              : []
                          }
                          action={actions.updateEmployeeWorkHours}
                        />
                        {e.face_descriptor && (
                          <ChangeEmployeePhoto employeeId={e.id} employeeName={e.name} />
                        )}
                        {canDelete && (
                          <DeleteEmployeeButton
                            employeeId={e.id}
                            employeeName={e.name}
                            action={actions.deleteEmployee}
                          />
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-4 py-2.5 border-t border-neutral-100 bg-neutral-50/50 text-[11.5px] text-neutral-500">
          Hiển thị{" "}
          <b className="text-neutral-700">{filtered.length}</b> / {employees.length} nhân viên
          {q || branchFilter !== "all" || typeFilter !== "all" ? " (đang lọc)" : ""}
        </div>
      </div>
    </>
  );
}

function StatChip({
  icon,
  label,
  children,
}: {
  icon: import("react").ReactNode;
  label: string;
  children: import("react").ReactNode;
}) {
  return (
    <div className="bg-white/80 backdrop-blur-sm border border-neutral-200/70 rounded-2xl px-4 py-3 min-w-[120px] shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-1.5 mb-1">
        {icon}
        {label}
      </div>
      <div className="flex items-baseline gap-0.5">{children}</div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase() || "?";
  const hue = (name.charCodeAt(0) * 137) % 360;
  return (
    <div
      className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0"
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 60% 40%))`,
      }}
    >
      {initial}
    </div>
  );
}
