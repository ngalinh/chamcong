"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Loader2, Play } from "lucide-react";

export function RunAuditButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/audit-absences", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lỗi");
      setMsg(`Đã quét tháng ${data.month} — tạo ${data.created} alert mới`);
      router.refresh();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="secondary" onClick={run} disabled={loading}>
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        Chạy đối chiếu tháng trước
      </Button>
      {msg && <span className="text-xs text-neutral-600">{msg}</span>}
    </div>
  );
}
