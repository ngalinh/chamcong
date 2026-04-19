"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadFaceModels, detectDescriptor } from "@/lib/face";
import { Button } from "@/components/ui/Button";
import { UploadCloud, User, Mail, Loader2 } from "lucide-react";

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
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function onPick(f: File | null) {
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
    setErr(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!file) {
      setErr("Chọn ảnh khuôn mặt trước");
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
      if (!result) throw new Error("Không phát hiện khuôn mặt trong ảnh. Chọn ảnh khác (nhìn thẳng, rõ mặt, đủ sáng).");

      const descriptor = Array.from(result.descriptor);
      const form = new FormData();
      form.append("name", name);
      form.append("photo", file);
      form.append("descriptor", JSON.stringify(descriptor));

      const res = await fetch("/api/self-enroll", { method: "POST", body: form });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Lỗi không xác định" }));
        throw new Error(error ?? "Server từ chối");
      }

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
        ⚠️ <b>Chỉ enroll được 1 lần.</b> Sau khi submit không tự đổi ảnh được — muốn đổi thì admin phải xoá tài khoản rồi enroll lại.
      </div>

      {err && <p className="text-sm text-rose-600">{err}</p>}

      <Button size="lg" disabled={loading} className="w-full">
        {loading && <Loader2 size={16} className="animate-spin" />}
        {loading ? "Đang xử lý..." : "Hoàn tất đăng ký"}
      </Button>
    </form>
  );
}
