"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadFaceModels, detectDescriptor, distance } from "@/lib/face";
import { getCurrentCoords, haversine } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { logError } from "@/lib/log";
import { Button } from "@/components/ui/Button";
import {
  MapPin,
  Camera,
  ScanFace,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
} from "lucide-react";

type Step = "idle" | "geo" | "camera" | "match" | "uploading" | "done" | "error";

type Office = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
};

type Props = {
  employeeId: string;
  employeeName: string;
  referenceDescriptor: number[];
  offices: Office[];
  threshold: number;
};

export default function CheckInFlow({
  employeeName,
  referenceDescriptor,
  offices,
  threshold,
}: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cancelledRef = useRef(false);

  const [step, setStep] = useState<Step>("idle");
  const [message, setMessage] = useState("Nhấn để bắt đầu");
  const [error, setError] = useState<string | null>(null);
  const [matchedOffice, setMatchedOffice] = useState<{ name: string; distM: number } | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [lateEarly, setLateEarly] = useState<string | null>(null);
  // Tách biệt "đang ở bước camera" vs "video đã có frame thật" để tránh flash màn đen
  const [cameraVisible, setCameraVisible] = useState(false);

  const stopCamera = useCallback(() => {
    const v = videoRef.current;
    const stream = v?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (v) v.srcObject = null;
  }, []);

  useEffect(() => () => {
    cancelledRef.current = true;
    stopCamera();
  }, [stopCamera]);

  // Preload models ngầm khi mount — đến lúc user click "Bắt đầu" thì models
  // (~7MB) đã sẵn sàng, không bị nối tiếp sau geo + camera nữa.
  useEffect(() => {
    loadFaceModels().catch(() => {});
  }, []);

  const close = useCallback(() => {
    cancelledRef.current = true;
    stopCamera();
    router.replace("/");
  }, [router, stopCamera]);

  async function run() {
    setError(null);
    setScore(null);
    setMatchedOffice(null);
    setCameraVisible(false);
    cancelledRef.current = false;
    let currentStep: Step = "idle";
    const goStep = (s: Step) => { currentStep = s; setStep(s); };

    try {
      if (offices.length === 0) throw new Error("Chưa có chi nhánh nào được cấu hình.");

      goStep("geo");
      setMessage("Đang kiểm tra vị trí...");
      const pos = await getCurrentCoords();
      if (cancelledRef.current) return;

      const ranked = offices
        .map((o) => ({
          office: o,
          distM: haversine(pos.latitude, pos.longitude, o.latitude, o.longitude),
        }))
        .sort((a, b) => a.distM - b.distM);

      const nearest = ranked[0];
      if (nearest.distM > nearest.office.radius_m) {
        throw new Error("Bạn đang không ở văn phòng");
      }
      setMatchedOffice({ name: nearest.office.name, distM: nearest.distM });

      goStep("camera");
      setMessage("Đang mở camera...");
      // Timeout 15s — iOS Safari nhiều khi treo getUserMedia khi permission đã bị deny
      // mà OS không re-prompt; fail nhanh để hiển thị lỗi cho user.
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 640 } },
          audio: false,
        }),
        new Promise<MediaStream>((_, reject) =>
          setTimeout(
            () => reject(new Error("Camera không phản hồi (timeout 15s). Vào Cài đặt → Safari → Camera, cho phép truy cập rồi thử lại.")),
            15000,
          ),
        ),
      ]);
      if (cancelledRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const v = videoRef.current!;
      v.srcObject = stream;

      // requestVideoFrameCallback fires khi frame đã vào GPU compositor.
      // QUAN TRỌNG: luôn có timeout — trên iOS PWA, callback KHÔNG fire nếu
      // element chưa được composit (opacity:0 có thể bị GPU optimizer bỏ qua).
      type RVFC = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
      const waitFrame = (timeoutMs = 3000) =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, timeoutMs); // fallback: không treo vô tận
          const ext = v as RVFC;
          if (ext.requestVideoFrameCallback) {
            ext.requestVideoFrameCallback(() => { clearTimeout(timer); resolve(); });
          } else {
            clearTimeout(timer);
            requestAnimationFrame(() => resolve());
          }
        });

      // Đợi frame thật sự xuất hiện (playing event) thay vì play() promise.
      // play() resolve ngay khi browser *bắt đầu* play, nhưng GPU buffer có thể
      // chưa có pixel → màn đen. playing/canplay đảm bảo data đã decode.
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => { cleanup(); reject(new Error("Camera không hiển thị được. Thử lại.")); },
          12000,
        );
        const cleanup = () => {
          clearTimeout(timer);
          v.onplaying = null;
          v.oncanplay = null;
        };
        v.onplaying = () => { cleanup(); resolve(); };
        // canplay làm fallback — một số trình duyệt không fire playing ngay
        v.oncanplay = () => { cleanup(); resolve(); };
        v.play().catch((err: unknown) => { cleanup(); reject(err); });
      });
      if (cancelledRef.current) return;

      // Hiển thị camera TRƯỚC khi gọi waitFrame — iOS PWA bắt buộc element phải
      // được composite (visible) thì requestVideoFrameCallback mới fire được.
      // Nếu để opacity:0 rồi mới waitFrame → deadlock: callback không bao giờ fire,
      // setCameraVisible(true) không bao giờ được gọi → màn đen vĩnh viễn.
      setCameraVisible(true);
      await waitFrame(3000); // timeout 3s: nếu không có frame thì vẫn tiếp tục
      if (cancelledRef.current) return;

      // Kiểm tra camera thực sự cung cấp frame — phát hiện "silent fail" trên iOS
      // (stream active, playing event fired, nhưng hardware không cung cấp pixel)
      if (!v.videoWidth) {
        throw new Error(
          "Camera không cung cấp được hình ảnh. Tắt hoàn toàn ứng dụng (vuốt lên → đóng app) rồi mở lại thử.",
        );
      }

      setMessage("Đang tải mô hình nhận diện...");
      await loadFaceModels();
      if (cancelledRef.current) return;

      goStep("match");
      setMessage("Nhìn thẳng vào camera...");
      const deadline = Date.now() + 10000;
      let lastDescriptor: Float32Array | null = null;
      let framesWithFace = 0;

      while (Date.now() < deadline && framesWithFace < 2) {
        if (cancelledRef.current) return;
        const result = await detectDescriptor(v);
        if (cancelledRef.current) return;
        if (result) {
          framesWithFace++;
          lastDescriptor = result.descriptor;
        }
        // Yield 120ms cho main thread xử lý touch/click events giữa các frame nặng
        await new Promise((r) => setTimeout(r, 120));
      }
      if (!lastDescriptor) {
        throw new Error("Không phát hiện được khuôn mặt. Thử chỗ sáng hơn.");
      }

      setMessage("Đang đối chiếu khuôn mặt...");
      const d = distance(referenceDescriptor, lastDescriptor);
      setScore(d);
      if (d > threshold) {
        throw new Error(`Khuôn mặt không khớp (độ khác ${d.toFixed(3)} > ${threshold}).`);
      }

      // iOS Safari 17.x đôi khi resolve play() + cho face-api detect được mặt nhưng
      // drawImage(video) vẫn ra khung đen (GPU buffer chưa sync về CPU). Đợi
      // requestVideoFrameCallback để chắc 1 frame đã paint, rồi sanity-check pixel.
      for (let i = 0; i < 10 && (!v.videoWidth || v.readyState < 2); i++) {
        await new Promise((r) => setTimeout(r, 60));
      }
      if (!v.videoWidth) throw new Error("Camera chưa sẵn sàng, vui lòng thử lại.");

      await waitFrame(2000);
      await waitFrame(2000);

      const canvas = canvasRef.current!;
      // Cap 480px max chiều dài lớn nhất + quality 0.7 → ~12-25KB/ảnh thay vì
      // 50-200KB. Đủ chất lượng face match (0.30 đã đo trên ảnh resize) và đủ
      // sắc nét cho thumbnail 64x64 trên admin list.
      const MAX_DIM = 480;
      const scale = Math.min(1, MAX_DIM / Math.max(v.videoWidth, v.videoHeight));
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

      const sample = ctx.getImageData(canvas.width >> 1, canvas.height >> 1, 8, 8).data;
      let isBlack = true;
      for (let i = 0; i < sample.length; i += 4) {
        if (sample[i] > 8 || sample[i + 1] > 8 || sample[i + 2] > 8) { isBlack = false; break; }
      }
      if (isBlack) {
        await waitFrame(2000);
        await waitFrame(2000);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      }

      const blob: Blob = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.7),
      );

      stopCamera();

      goStep("uploading");
      setMessage("Đang gửi dữ liệu...");
      const form = new FormData();
      form.append("selfie", blob, "selfie.jpg");
      form.append("office_id", nearest.office.id);
      form.append("latitude", String(pos.latitude));
      form.append("longitude", String(pos.longitude));
      form.append("distance_m", String(nearest.distM));
      form.append("face_match_score", String(d));
      form.append("liveness_passed", "false");

      const res = await fetch("/api/checkin", { method: "POST", body: form });
      const respData: { ok?: boolean; error?: string; kind?: "in" | "out"; late_minutes?: number; early_minutes?: number } =
        await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(respData.error ?? "Server từ chối");
      }

      goStep("done");
      if (respData.kind === "in" && respData.late_minutes) {
        setLateEarly(`⚠️ Bạn đã đi làm muộn ${respData.late_minutes} phút`);
      } else if (respData.kind === "out" && respData.early_minutes) {
        setLateEarly(`⚠️ Bạn đã về sớm ${respData.early_minutes} phút`);
      }
      const label = respData.kind === "out" ? "Check-out" : "Check-in";
      setMessage(`Đã ${label} tại ${nearest.office.name}`);
      setTimeout(() => router.push("/"), respData.late_minutes || respData.early_minutes ? 3500 : 1800);
    } catch (e: unknown) {
      stopCamera();
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStep("error");
      logError(e, { where: "CheckInFlow.run", step: currentStep });
    }
  }

  const showCamera = step === "camera" || step === "match";

  return (
    <main className="relative min-h-dvh bg-neutral-950 text-white overflow-hidden">
      {/* Background video (mirrored selfie) */}
      <div className="absolute inset-0">
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className={cn(
            // object-contain giữ nguyên tỉ lệ camera, không crop/zoom.
            // object-cover buộc scale up để phủ màn hình → mặt to gấp ~1.5–1.75×
            // (đặc biệt khi camera trả về landscape stream trên màn hình portrait).
            "h-full w-full object-contain scale-x-[-1] transition-opacity duration-500",
            cameraVisible ? "opacity-100" : "opacity-0",
          )}
        />
        <canvas ref={canvasRef} className="hidden" />
        {/* Subtle gradient overlay for text legibility */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent, rgba(0,0,0,0.7))" }} />
      </div>

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 pt-safe px-safe z-10">
        <div className="flex items-center justify-between py-3">
          <button
            type="button"
            onClick={close}
            aria-label="Đóng"
            className="h-10 w-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center active:bg-white/20"
          >
            <X size={20} />
          </button>
          <p className="text-sm font-medium">{employeeName}</p>
          <div className="w-10" />
        </div>
      </div>

      {/* Camera frame indicator */}
      {showCamera && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-[min(75vw,380px)] w-[min(75vw,380px)] rounded-full border-2 border-white/40 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
      )}

      {/* Status pill */}
      <div className="absolute top-20 inset-x-0 flex justify-center z-10">
        <StatusPill step={step} message={message} />
      </div>

      {/* Bottom content */}
      <div className="absolute bottom-0 inset-x-0 pb-safe px-safe pt-8 z-10">
        <div className="mx-auto max-w-md">
          {matchedOffice && (
            <InfoRow icon={MapPin} label={matchedOffice.name} value={`cách ${Math.round(matchedOffice.distM)}m`} />
          )}
          {score != null && (
            <InfoRow
              icon={ScanFace}
              label="Độ khớp khuôn mặt"
              value={`${score.toFixed(3)} / ${threshold}`}
              tone={score < threshold ? "ok" : "warn"}
            />
          )}
          {lateEarly && (
            <div className="rounded-2xl bg-amber-500/20 backdrop-blur border border-amber-400/40 p-4 text-sm text-amber-100 mb-4 font-medium">
              {lateEarly}
            </div>
          )}
          {error && (
            <div className="rounded-2xl bg-rose-500/15 backdrop-blur border border-rose-400/30 p-4 text-sm text-rose-100 mb-4">
              {error}
            </div>
          )}

          {step === "idle" || step === "error" ? (
            <button
              onClick={run}
              className="w-full h-16 rounded-2xl bg-white text-neutral-900 font-semibold text-lg shadow-2xl active:scale-[0.98] transition"
            >
              {step === "error" ? "Thử lại" : "Bắt đầu chấm công"}
            </button>
          ) : step === "done" ? (
            <Button size="lg" variant="secondary" className="w-full bg-white/15 backdrop-blur border-white/30 text-white hover:bg-white/25" onClick={() => router.push("/")}>
              Về trang chủ
            </Button>
          ) : (
            <div className="h-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center gap-2 text-white/80">
              <Loader2 size={18} className="animate-spin" /> Đang xử lý...
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function StatusPill({ step, message }: { step: Step; message: string }) {
  const map: Record<Step, { icon: React.ComponentType<{ size?: number; className?: string }>; cls: string }> = {
    idle:      { icon: Camera,       cls: "bg-white/15 text-white" },
    geo:       { icon: MapPin,       cls: "bg-white/15 text-white" },
    camera:    { icon: Camera,       cls: "bg-white/15 text-white" },
    match:     { icon: ScanFace,     cls: "bg-white/15 text-white" },
    uploading: { icon: Loader2,      cls: "bg-white/15 text-white" },
    done:      { icon: CheckCircle2, cls: "bg-emerald-500 text-white" },
    error:     { icon: XCircle,      cls: "bg-rose-500 text-white" },
  };
  const { icon: Icon, cls } = map[step];
  const spinning = step === "uploading" || step === "match" || step === "geo";
  return (
    <div className={cn("rounded-full backdrop-blur px-4 py-2 flex items-center gap-2 text-sm font-medium shadow-lg", cls)}>
      <Icon size={16} className={spinning ? "animate-spin" : ""} />
      {message}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  tone = "ok",
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const toneCls = tone === "ok" ? "text-white/90" : "text-amber-300";
  return (
    <div className="flex items-center gap-3 text-sm text-white/80 mb-2">
      <div className="h-8 w-8 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0 truncate">{label}</div>
      <div className={cn("text-xs", toneCls)}>{value}</div>
    </div>
  );
}
