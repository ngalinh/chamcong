"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadFaceModels, detectDescriptor } from "@/lib/face";
import { ensurePushSubscribed } from "@/lib/push-client";
import { Button } from "@/components/ui/Button";
import { UploadCloud, User, Mail, Loader2, CheckCircle2, ScanFace } from "lucide-react";

type DetectState =
  | { kind: "idle" }
  | { kind: "analyzing" }
  | { kind: "ok"; descriptor: number[] }
  | { kind: "error"; message: string };

export default function SelfEnrollForm({
  email,
  defaultName,
}: {
  email: string;
  defaultName?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaultName ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [detect, setDetect] = useState<DetectState>({ kind: "idle" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Preload face models ngay khi vào trang — giảm thời gian submit sau này
  useEffect(() => {
    loadFaceModels().catch((e) => console.warn("[face] preload failed", e));
  }, []);

  function onPick(f: File | null) {
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
    setErr(null);
    setDetect(f ? { kind: "analyzing" } : { kind: "idle" });
  }

  // Khi ảnh load xong → detect descriptor ngay (không đợi click submit)
  async function onImageLoad() {
    const img = imgRef.current;
    if (!img || !file) return;
    try {
      await loadFaceModels();
      const result = await detectDescriptor(img);
      if (!result) {
        setDetect({ kind: "error", message: "Không phát hiện khuôn mặt. Chọn ảnh khác (rõ mặt, nhìn thẳng, đủ sáng)." });
        return;
      }
      setDetect({ kind: "ok", descriptor: Array.from(result.descriptor) });
    } catch (e: unknown) {
      setDetect({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!file) {
      setErr("Chọn ảnh khuôn mặt trước");
      return;
    }
    if (detect.kind === "analyzing") {
      setErr("Đang phân tích ảnh, đợi 1 giây…");
      return;
    }
    if (detect.kind !== "ok") {
      setErr(detect.kind === "error" ? detect.message : "Chưa nhận diện được khuôn mặt");
      return;
    }

    setLoading(true);
    try {
      const form = new FormData();
      form.append("name", name);
      form.append("photo", file);
      form.append("descriptor", JSON.stringify(detect.descriptor));

      const res = await fetch("/api/self-enroll", { method: "POST", body: form });
      if (!res.ok) {
        let errorMsg = `Server từ chối (HTTP ${res.status})`;
        try {
          const data = await res.json();
          if (data?.error) errorMsg = data.error;
        } catch {
          if (res.status === 413) errorMsg = "Ảnh quá lớn (>10MB). Chọn ảnh nhỏ hơn.";
          else if (res.status === 502 || res.status === 504) errorMsg = "Máy chủ đang bận, thử lại sau 10 giây.";
          else if (res.status === 401) errorMsg = "Phiên đăng nhập hết hạn, reload lại trang.";
        }
        throw new Error(errorMsg);
      }

      // Tận dụng user gesture của click submit → auto-enable push noti
      // (iOS PWA bắt buộc gesture mới cho Notification.requestPermission())
      ensurePushSubscribed().catch(() => {});

      router.push("/");
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {/* Email read-only */}
      <label className="block">
        <div className="text-xs font-medium text-neutral-600 mb-1.5 flex items-center gap-1.5">
          <Mail size={13} className="text-neutral-400" /> Email
        </div>
        <div className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 flex items-center text-sm text-neutral-600 select-none">
          {email}
        </div>
      </label>

      {/* Họ tên */}
      <label className="block">
        <div className="text-xs font-medium text-neutral-600 mb-1.5 flex items-center gap-1.5">
          <User size={13} className="text-neutral-400" /> Họ tên
        </div>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nhập họ tên đầy đủ"
          className="w-full h-11 rounded-xl border border-neutral-200 bg-white px-3 text-[15px] outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/5"
        />
      </label>

      {/* Photo uploader */}
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
              onLoad={onImageLoad}
              className="h-20 w-20 rounded-xl object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{file?.name}</div>
              <div className="text-xs text-neutral-500 flex items-center gap-1">
                {detect.kind === "analyzing" && (
                  <><Loader2 size={11} className="animate-spin" /> Đang phân tích…</>
                )}
                {detect.kind === "ok" && (
                  <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={11} /> Đã nhận diện khuôn mặt</span>
                )}
                {detect.kind === "error" && (
                  <span className="text-rose-600 flex items-center gap-1"><ScanFace size={11} /> Không nhận diện được</span>
                )}
                {detect.kind === "idle" && file && `${(file.size / 1024).toFixed(0)} KB`}
                <span className="text-neutral-400"> · click để đổi ảnh</span>
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
              <div className="text-xs">Chân dung rõ mặt, nhìn thẳng, đủ sáng</div>
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

      <div className="rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 p-3 text-xs leading-relaxed">
        💡 Bạn có thể bấm vào khung ảnh để <b>đổi ảnh</b> trước khi hoàn tất. Sau khi bấm <b>Hoàn tất đăng ký</b>,
        muốn đổi ảnh phải liên hệ admin.
      </div>

      {err && <p className="text-sm text-rose-600">{err}</p>}

      <Button size="lg" disabled={loading || detect.kind === "analyzing"} className="w-full">
        {loading && <Loader2 size={16} className="animate-spin" />}
        {loading ? "Đang xử lý..." : detect.kind === "analyzing" ? "Đang phân tích ảnh..." : "Hoàn tất đăng ký"}
      </Button>
    </form>
  );
}
