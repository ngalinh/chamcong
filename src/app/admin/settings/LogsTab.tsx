import { createAdminClient } from "@/lib/supabase/admin";
import { Empty } from "@/components/ui/Empty";
import { AlertTriangle, Info, AlertCircle } from "lucide-react";
import { formatVN } from "@/lib/time";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

type LogRow = {
  id: number;
  created_at: string;
  level: "error" | "warn" | "info";
  message: string;
  stack: string | null;
  url: string | null;
  user_agent: string | null;
  context: Record<string, unknown> | null;
  employee_id: string | null;
  employee: { name: string | null; email: string | null } | null;
};

export async function LogsTab({ level = "all" }: { level?: string }) {
  const admin = createAdminClient();
  let q = admin
    .from("error_logs")
    .select("id, created_at, level, message, stack, url, user_agent, context, employee_id, employee:employees(name, email)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (level !== "all") q = q.eq("level", level);

  const { data, error } = await q;

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        Lỗi đọc bảng error_logs: {error.message}.
        Có thể chưa apply migration <code>20260505000000_error_logs.sql</code> trên Supabase.
      </div>
    );
  }

  const rows = (data ?? []) as unknown as LogRow[];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Log app</h2>
          <p className="text-sm text-neutral-500 mt-1">
            200 sự kiện gần nhất. Lỗi client (browser) và server (Next.js) đều ghi vào đây.
          </p>
        </div>
        <form className="flex items-center gap-2">
          <input type="hidden" name="tab" value="logs" />
          <label className="text-xs text-neutral-500">Mức:</label>
          <select
            name="level"
            defaultValue={level}
            className="h-9 rounded-lg border border-neutral-200 bg-white px-2 text-sm"
          >
            <option value="all">Tất cả</option>
            <option value="error">Error</option>
            <option value="warn">Warn</option>
            <option value="info">Info</option>
          </select>
          <button type="submit" className="h-9 px-3 rounded-lg bg-neutral-900 text-white text-sm">Lọc</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <Empty icon={Info} title="Chưa có log nào" description="Khi có lỗi xảy ra trong app, nó sẽ tự động xuất hiện ở đây." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <LogCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function LogCard({ row: r }: { row: LogRow }) {
  const tone =
    r.level === "error" ? { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", Icon: AlertTriangle } :
    r.level === "warn"  ? { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", Icon: AlertCircle } :
                          { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200", Icon: Info };

  return (
    <details className="rounded-2xl border border-white/60 glass">
      <summary className="cursor-pointer p-3 flex items-start gap-3">
        <div className={`h-9 w-9 rounded-lg ${tone.bg} ${tone.text} flex items-center justify-center shrink-0`}>
          <tone.Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${tone.border} ${tone.bg} ${tone.text}`}>
              {r.level}
            </span>
            {r.employee?.name && (
              <span className="text-xs text-neutral-700 font-medium truncate">{r.employee.name}</span>
            )}
            <span className="text-[10px] text-neutral-400">
              {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: vi })}
              {" · "}{formatVN(r.created_at, "d/M HH:mm:ss")}
            </span>
          </div>
          <div className="text-sm text-neutral-900 mt-1 break-words">{r.message}</div>
          {r.url && <div className="text-[10px] text-neutral-400 truncate mt-0.5">{r.url}</div>}
        </div>
      </summary>
      <div className="px-3 pb-3 pt-1 space-y-2 text-xs">
        {r.context && (
          <div>
            <div className="text-neutral-500 mb-1">Context</div>
            <pre className="bg-neutral-50 rounded-lg p-2 overflow-x-auto text-[11px]">{JSON.stringify(r.context, null, 2)}</pre>
          </div>
        )}
        {r.stack && (
          <div>
            <div className="text-neutral-500 mb-1">Stack</div>
            <pre className="bg-neutral-50 rounded-lg p-2 overflow-x-auto text-[11px] whitespace-pre-wrap">{r.stack}</pre>
          </div>
        )}
        {r.user_agent && (
          <div><span className="text-neutral-500">UA: </span><span className="text-neutral-700 break-all">{r.user_agent}</span></div>
        )}
        {r.employee?.email && (
          <div><span className="text-neutral-500">Email: </span><span className="text-neutral-700">{r.employee.email}</span></div>
        )}
      </div>
    </details>
  );
}
