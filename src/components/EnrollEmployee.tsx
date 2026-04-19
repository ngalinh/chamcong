"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadFaceModels, detectDescriptor } from "@/lib/face";
import { Button } from "@/components/ui/Button";
import { UploadCloud, Mail, User, Loader2, CheckCircle2 } from "lucide-react";

export default function EnrollEmployee() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
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
    setMsg(null);
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
      if (!result) throw new Error("Không phát hiện khuôn mặt trong ảnh. Chọn ảnh khác.");

      const descriptor = Array.from(result.descriptor);
      const form = new FormData();
      form.append("email", email);
      form.append("name", name);
      form.append("photo", file);
      form.append("descriptor", JSON.stringify(descriptor));

      const res = await fetch("/api/admin/employees", { method: "POST", body: form });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Lỗi không xác định" }));
        throw new Error(error ?? "Server từ chối");
      }

      setMsg(`Đã enroll ${name}`);
      setEmail("");
      setName("");
      onPick(null);
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
      <h2 className="font-semibold">Thêm nhân viên mới</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <InputField icon={Mail} type="email" value={email} onChange={setEmail} placeholder="Email công ty" required />
        <InputField icon={User} value={name} onChange={setName} placeholder="Họ tên" required />
      </div>

      <label
        className="relative block rounded-xl border-2 border-dashed border-neutral-300 hover:border-indigo-400 hover:bg-indigo-50/30 transition cursor-pointer p-4"
        onDragOver={(e) => { e.preventDefault(); }}
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
              className="h-16 w-16 rounded-lg object-cover"
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
            <div className="h-10 w-10 rounded-lg bg-neutral-100 flex items-center justify-center">
              <UploadCloud size={18} />
            </div>
            <div className="text-sm">
              <div className="font-medium text-neutral-700">Chọn ảnh khuôn mặt</div>
              <div className="text-xs">Chụp chân dung rõ mặt, nhìn thẳng, đủ sáng</div>
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
      {msg && (
        <p className="text-sm text-emerald-600 flex items-center gap-1.5">
          <CheckCircle2 size={16} /> {msg}
        </p>
      )}

      <Button size="md" disabled={loading} className="w-full md:w-auto">
        {loading && <Loader2 size={16} className="animate-spin" />}
        {loading ? "Đang xử lý..." : "Enroll nhân viên"}
      </Button>
    </form>
  );
}

function InputField({
  icon: Icon,
  value,
  onChange,
  ...rest
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <div className="relative">
      <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 rounded-xl border border-neutral-200 pl-9 pr-3 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/5"
        {...rest}
      />
    </div>
  );
}
