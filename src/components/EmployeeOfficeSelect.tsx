"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";

type OfficeOpt = { id: string; name: string; is_remote: boolean };

export default function EmployeeOfficeSelect({
  employeeId,
  currentOfficeId,
  offices,
  action,
}: {
  employeeId: string;
  currentOfficeId: string | null;
  offices: OfficeOpt[];
  action: (formData: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form className="flex-1 min-w-0 flex items-center gap-1.5">
      <input type="hidden" name="id" value={employeeId} />
      <select
        name="home_office_id"
        defaultValue={currentOfficeId ?? ""}
        disabled={pending}
        onChange={(e) => {
          const fd = new FormData();
          fd.set("id", employeeId);
          fd.set("home_office_id", e.target.value);
          startTransition(() => action(fd));
        }}
        className="h-9 w-full min-w-0 rounded-lg border border-neutral-200 bg-white px-2 text-sm outline-none focus:border-neutral-900 disabled:opacity-50"
      >
        <option value="">— Đổi chi nhánh —</option>
        {offices.map((o) => (
          <option key={o.id} value={o.id}>
            {o.is_remote ? "🌐 " : ""}{o.name}
          </option>
        ))}
      </select>
      {pending && <Loader2 size={14} className="animate-spin text-neutral-400 shrink-0" />}
    </form>
  );
}
