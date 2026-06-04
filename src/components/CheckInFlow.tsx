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

  // ---- DEBUG overlay (tạm thời để chẩn đoán black camera) ----
  const [dbg, setDbg] = useState<string | null>(null);
  const dbgStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (!cameraVisible) { setDbg(null); dbgStartRef.current = null; return; }
    if (!dbgStartRef.current) dbgStartRef.current = Date.now();
    const iv = setInterval(() => {
      const v = videoRef.current;
      if (!v) return;
      const t = ((Date.now() - dbgStartRef.current!) / 1000).toFixed(1);
      let px = "N/A", pxErr = "";
      try {
        const c = document.createElement("canvas"); c.width = 8; c.height = 8;
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.drawImage(v, 0, 0, 8, 8);
          const d = ctx.getImageData(0, 0, 8, 8).data;
          let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i+1] + d[i+2];
          px = `avg=${Math.round(s / (d.length / 4 * 3))} rgb(${d[0]},${d[1]},${d[2]})`;
        }
      } catch (e) { pxErr = ` ERR:${e instanceof Error ? e.name : "?"}` ; }
      setDbg(`t=${t}s rs=${v.readyState} ${v.videoWidth}x${v.videoHeight} ${v.paused?"PAUSED":"play"}\npx: ${px}${pxErr}`);
    }, 500);
    return () => clearInterval(iv);
  }, [cameraVisible]);
  // ---- end DEBUG ----

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
          // facingMode ideal (soft constraint) thay vì hard — nếu front camera momentarily
          // busy thì fallback về bất kỳ camera nào thay vì reject hoàn toàn.
          video: { facingMode: { ideal: "user" }, width: { ideal: 480 }, height: { ideal: 640 } },
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
      setCameraVisible(true);
      // Gọi play() ngay sau khi attach stream — càng gần getUserMedia callback càng tốt
      // để tận dụng user-gesture context (iOS có thể expire gesture sau vài giây await).
      v.play().catch(() => {});
      const cameraAttachedAt = Date.now();

      // requestVideoFrameCallback có timeout — không bao giờ treo vô hạn.
      type RVFC = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
      const waitFrame = (timeoutMs = 2000) =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, timeoutMs);
          const ext = v as RVFC;
          if (ext.requestVideoFrameCallback) {
            ext.requestVideoFrameCallback(() => { clearTimeout(timer); resolve(); });
          } else {
            clearTimeout(timer);
            requestAnimationFrame(() => resolve());
          }
        });

      // Đợi camera có pixel thật — không chỉ readyState.
      // iOS camera sensor cần 300-1500ms warm-up sau khi stream attach: trong thời gian
      // đó readyState đã >= 3 nhưng toàn bộ frame vẫn đen → face detection fail.
      // Polling sample 16×16 pixel ở giữa: nếu thấy bất kỳ pixel nào sáng (> 20/255)
      // thì camera thật sự đã sẵn sàng. Nếu sau 4s vẫn đen → có thể phòng tối / hardware
      // issue → proceed anyway để face detection báo lỗi cụ thể hơn.
      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = 16; sampleCanvas.height = 16;
      const sampleCtx = sampleCanvas.getContext("2d");

      const cameraReady = await new Promise<boolean>((resolve) => {
        let settled = false;
        let streamReadyAt: number | null = null;
        let pixelSampleWorking = true;
        let lastPlayRetry = 0;

        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          clearInterval(poll);
          v.onplaying = null;
          v.oncanplay = null;
          resolve(ok);
        };

        const timer = setTimeout(() => finish(false), 12000);

        const poll = setInterval(() => {
          const now = Date.now();

          // Retry play() mỗi 1.5s nếu video vẫn paused — play() đầu có thể fail
          // silently do iOS gesture context hoặc stream chưa sẵn sàng.
          if (v.paused && now - lastPlayRetry > 1500) {
            lastPlayRetry = now;
            v.play().catch(() => {});
          }

          // Fast-fail: nếu sau 5s stream vẫn rs=0 + 0x0 → stream "chết" (track không
          // produce data, thường do iOS camera bị lock bởi process khác). Fail nhanh
          // để caller có thể retry getUserMedia thay vì đợi 12s vô ích.
          if (now - cameraAttachedAt > 5000 && v.readyState === 0 && !v.videoWidth) {
            finish(false);
            return;
          }

          // Phase 1: chờ stream có metadata (dimension)
          if (!v.videoWidth || v.readyState < 2) return;
          if (!streamReadyAt) streamReadyAt = Date.now();

          const elapsed = Date.now() - streamReadyAt;

          // Bắt buộc chờ ít nhất 600ms sau khi stream có dimension — sensor cần thời gian
          // khởi động: iOS camera thường produce all-black frame trong ~300-800ms đầu.
          if (elapsed < 600) return;

          // Phase 2: sample pixel để phát hiện warm-up xong
          if (sampleCtx && pixelSampleWorking) {
            try {
              sampleCtx.drawImage(v, 0, 0, 16, 16);
              const d = sampleCtx.getImageData(0, 0, 16, 16).data;
              for (let i = 0; i < d.length; i += 4) {
                if (d[i] > 20 || d[i + 1] > 20 || d[i + 2] > 20) {
                  finish(true);
                  return;
                }
              }
            } catch {
              pixelSampleWorking = false;
            }
          }

          // Time-based fallback
          const maxWait = pixelSampleWorking ? 5000 : 2000;
          if (elapsed > maxWait) finish(true);
        }, 200);

        v.onplaying = () => { if (!streamReadyAt) streamReadyAt = Date.now(); };
        v.oncanplay = () => { if (!streamReadyAt) streamReadyAt = Date.now(); };
        // Note: v.play() đã được gọi trước promise này
      });
      if (cancelledRef.current) return;

      if (!cameraReady) {
        // Stream "chết" (rs=0, 0x0) — iOS camera bị lock bởi process khác, hoặc
        // play() fail do timing. Dừng stream hiện tại và thử lại với constraint tối giản.
        const isDeadStream = v.readyState === 0 && !v.videoWidth;
        if (!isDeadStream) {
          throw new Error(
            "Camera không khởi động được. Tắt hoàn toàn ứng dụng (vuốt lên → đóng app) rồi mở lại.",
          );
        }

        stream.getTracks().forEach((t) => t.stop());
        v.srcObject = null;
        setMessage("Camera chưa phản hồi, đang thử lại...");
        await new Promise((r) => setTimeout(r, 1000));
        if (cancelledRef.current) return;

        let retryStream: MediaStream;
        try {
          // Dùng constraint tối giản — bỏ facingMode/resolution để iOS không reject
          retryStream = await Promise.race([
            navigator.mediaDevices.getUserMedia({ video: true, audio: false }),
            new Promise<MediaStream>((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), 10000),
            ),
          ]);
        } catch {
          throw new Error(
            "Camera không phản hồi. Thử: mở app Camera gốc rồi đóng lại, sau đó thử lại. Nếu vẫn lỗi — tắt nguồn điện thoại hoàn toàn và bật lại.",
          );
        }

        v.srcObject = retryStream;
        v.play().catch(() => {});

        // Chờ retry stream có data (8s)
        const retryOk = await new Promise<boolean>((resolve) => {
          const t = setTimeout(() => resolve(false), 8000);
          const iv = setInterval(() => {
            if (v.paused) v.play().catch(() => {});
            if (v.videoWidth && v.readyState >= 2) {
              clearTimeout(t); clearInterval(iv); resolve(true);
            }
          }, 200);
        });
        if (cancelledRef.current) return;

        if (!retryOk) {
          throw new Error(
            "Camera vẫn không phản hồi sau khi thử lại. Tắt nguồn điện thoại hoàn toàn (không chỉ sleep) và bật lại.",
          );
        }
        // retryStream đang hoạt động — tiếp tục bình thường
      }

      // Pixel sampling có thể resolve qua timeout khi camera vẫn đen (play() failed
      // silent hoặc hardware stuck). Thử play() lại; muted+playsInline không cần gesture.
      if (v.paused) {
        try { await v.play(); } catch {}
        await new Promise((r) => setTimeout(r, 500));
        if (cancelledRef.current) return;
      }

      await waitFrame(2000);

      setMessage("Đang tải mô hình nhận diện...");
      await loadFaceModels();
      if (cancelledRef.current) return;

      // iOS có thể pause camera stream trong khi loadFaceModels chạy nặng (WebGL compile).
      // Kiểm tra và resume trước khi bắt đầu nhận diện.
      if (v.paused) { v.play().catch(() => {}); }

      goStep("match");
      setMessage("Nhìn thẳng vào camera...");
      const deadline = Date.now() + 10000;
      let lastDescriptor: Float32Array | null = null;
      let framesWithFace = 0;

      while (Date.now() < deadline && framesWithFace < 2) {
        if (cancelledRef.current) return;
        // Nếu camera bị pause giữa chừng (iOS background/interrupt), resume ngay
        if (v.paused) { v.play().catch(() => {}); }
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
        {/*
          scale-x-[-1] đặt trên wrapper div, KHÔNG trên <video> trực tiếp.
          iOS Safari bug: CSS transform trên video element gây black render do GPU
          compositor conflict với live camera stream. Wrapper div tránh được issue này.
        */}
        <div className="h-full w-full scale-x-[-1]">
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className={cn(
              "h-full w-full object-contain transition-opacity duration-500",
              cameraVisible ? "opacity-100" : "opacity-0",
            )}
          />
        </div>
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

      {/* DEBUG overlay — xoá sau khi chẩn đoán xong */}
      {dbg && (
        <div className="absolute bottom-52 inset-x-2 z-20 bg-black/85 rounded-lg p-2 font-mono text-[11px] text-green-300 whitespace-pre-wrap pointer-events-none">
          {dbg}
        </div>
      )}

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
