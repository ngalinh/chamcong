"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadFaceModels, detectDescriptor } from "@/lib/face";
import { Button } from "@/components/ui/Button";
import { Camera, UploadCloud, X, Loader2, Check } from "lucide-react";

export function ChangeEmployeePhoto({
  employeeId,
  employeeName,
}: {
  employeeId: string;
  employeeName: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const imgRef = useRef<HTMLImageElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!open) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(null);
      setPreviewUrl(null);
      setErr(null);
      setOk(false);
    }
    const prev = document.body.style.overflow;
    if (open) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open, previewUrl]);

  function onPick(f: File | null) {
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
    setErr(null);
    setOk(false);
  }

  async function submit() {
    setErr(null);
    if (!file) {
      setErr("Chọn ảnh trước");
      return;
    }
    setLoading(true);
    try {
      await loadFaceModels();
      const img = imgRef.current!;
      await new Promise<void>((resolve, reject) => {
        if (img.complete && img.naturalWidth > 0) resolve();
        else {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Không load được ảnh"));
        }
      });
      const result = await detectDescriptor(img);
      if (!result) throw new Error("Không phát hiện khuôn mặt. Chọn ảnh khác (rõ mặt, đủ sáng).");

      const form = new FormData();
      form.append("employee_id", employeeId);
      form.append("photo", file);
      form.append("descriptor", JSON.stringify(Array.from(result.descriptor)));

      const res = await fetch("/api/admin/employees/change-photo", { method: "POST", body: form });
      if (!res.ok) {
        let msg = `Server từ chối (HTTP ${res.status})`;
        try {
          const d = await res.json();
          if (d?.error) msg = d.error;
        } catch {
          if (res.status === 413) msg = "Ảnh quá lớn (>10MB)";
        }
        throw new Error(msg);
      }
      setOk(true);
      setTimeout(() => {
        setOpen(false);
        router.refresh();
      }, 900);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="h-8 w-8 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-50 flex items-center justify-center text-neutral-600"
        title="Đổi ảnh"
      >
        <Camera size={14} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={() => !loading && setOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <div>
                <h2 className="font-semibold">Đổi ảnh khuôn mặt</h2>
                <p className="text-xs text-neutral-500 mt-0.5 truncate">{employeeName}</p>
              </div>
              <button
                disabled={loading}
                onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-full hover:bg-neutral-100 flex items-center justify-center disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 pb-5 space-y-3">
              <label
                className="block rounded-xl border-2 border-dashed border-neutral-300 hover:border-indigo-400 hover:bg-indigo-50/30 transition cursor-pointer p-4"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) onPick(f);
                }}
              >
                {previewUrl ? (
                  <div className="flex items-center gap-3">
                    <img
                      ref={imgRef}
                      src={previewUrl}
                      alt="preview"
                      className="h-20 w-20 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{file?.name}</div>
                      <div className="text-xs text-neutral-500">
                        {file && `${(file.size / 1024).toFixed(0)} KB — click để đổi ảnh`}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-neutral-500">
                    <div className="h-11 w-11 rounded-xl bg-neutral-100 flex items-center justify-center">
                      <UploadCloud size={18} />
                    </div>
                    <div className="text-sm">
                      <div className="font-medium text-neutral-700">Chọn ảnh khuôn mặt</div>
                      <div className="text-xs">Chân dung rõ mặt, nhìn thẳng</div>
                    </div>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                />
              </label>

              {err && <p className="text-sm text-rose-600">{err}</p>}
              {ok && (
                <p className="text-sm text-emerald-600 flex items-center gap-1.5">
                  <Check size={16} /> Đã cập nhật ảnh
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  variant="secondary"
                  disabled={loading}
                  onClick={() => setOpen(false)}
                  className="flex-1"
                >
                  Huỷ
                </Button>
                <Button onClick={submit} disabled={loading || !file} className="flex-1">
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  {loading ? "Đang xử lý..." : "Cập nhật"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
