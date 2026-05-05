"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";

export function DeleteEmployeeButton({
  employeeId,
  employeeName,
  action,
}: {
  employeeId: string;
  employeeName: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  function confirmDelete() {
    const fd = new FormData();
    fd.append("id", employeeId);
    startTransition(async () => {
      await action(fd);
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="danger"
        type="button"
        title="Xoá tài khoản"
        onClick={() => setOpen(true)}
      >
        <Trash2 size={14} />
      </Button>

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3 flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold">Xoá tài khoản nhân viên?</h2>
                <p className="text-sm text-neutral-600 mt-1">
                  Bạn có chắc muốn xoá <b className="break-words">{employeeName}</b>?
                  Tài khoản sẽ bị <b>khoá</b> và NV không thể đăng nhập lại.
                  Lịch sử check-in, đơn nghỉ, OT... vẫn được giữ lại để tham chiếu.
                </p>
              </div>
            </div>

            <div className="px-5 pb-5 pt-2 flex gap-2">
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => setOpen(false)}
                className="flex-1"
              >
                Huỷ
              </Button>
              <Button
                variant="danger"
                disabled={pending}
                onClick={confirmDelete}
                className="flex-1"
              >
                {pending && <Loader2 size={16} className="animate-spin" />}
                {pending ? "Đang xoá..." : "Xoá"}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
