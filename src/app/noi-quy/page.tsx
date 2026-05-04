import Link from "next/link";
import { ArrowLeft, Clock, CalendarOff, CloudRain, Home, Hourglass, AlertTriangle } from "lucide-react";

export const dynamic = "force-static";

export const metadata = {
  title: "Nội quy chấm công",
};

export default function PoliciesPage() {
  return (
    <main className="mx-auto max-w-2xl min-h-dvh px-safe pt-safe pb-safe flex flex-col gap-6 px-4 pb-10">
      <header className="flex items-center gap-2 pt-2">
        <Link
          href="/"
          className="h-10 w-10 rounded-full hover:bg-white/50 flex items-center justify-center text-neutral-600"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-neutral-400 font-medium">Quy định công ty</p>
          <h1 className="text-2xl font-semibold tracking-tight">Nội quy chấm công</h1>
        </div>
      </header>

      {/* ===== Đi muộn / Về sớm ===== */}
      <section className="rounded-2xl glass border border-white/60 p-5 space-y-5">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock size={18} />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">Đi muộn / Về sớm</h2>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="font-semibold text-sm">
              Mức nhẹ — đi muộn <Code>≤ 30 phút</Code> hoặc về sớm <Code>&gt; 5 phút</Code>
            </h3>
            <ul className="list-disc pl-5 text-sm text-neutral-700 mt-1.5 space-y-0.5">
              <li><b>3 lần đầu</b> trong tháng: miễn phạt</li>
              <li>Từ <b>lần thứ 4</b>: phạt <b>50,000 VND/lần</b></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-sm">
              Mức nặng — đi muộn <Code>&gt; 30 phút</Code>
            </h3>
            <ul className="list-disc pl-5 text-sm text-neutral-700 mt-1.5 space-y-0.5">
              <li><b>KHÔNG có miễn phạt</b></li>
              <li>
                Tiền phạt = <Code>50,000</Code> (cho 30 phút đầu) + lương cho mỗi block 15 phút thêm vào (làm tròn lên)
              </li>
              <li>
                Ví dụ NV lương 60k/giờ:
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  <li>Đi muộn 40 phút → <Code>50k + 1 × 15k = 65k</Code></li>
                  <li>Đi muộn 65 phút → <Code>50k + 3 × 15k = 95k</Code></li>
                </ul>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-sm">Miễn phạt hoàn toàn</h3>
            <ul className="list-disc pl-5 text-sm text-neutral-700 mt-1.5">
              <li>Có đơn xin nghỉ theo giờ đã được duyệt cho khoảng thời gian đó</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ===== Xin nghỉ ===== */}
      <section className="rounded-2xl glass border border-white/60 p-5 space-y-5">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <CalendarOff size={18} />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">Xin nghỉ</h2>
        </div>

        <div>
          <h3 className="font-semibold text-sm mb-2">Các loại nghỉ</h3>
          <div className="space-y-2">
            <LeaveCard
              icon={CloudRain}
              tone="sky"
              title="Làm online — trời mưa"
              desc="Mưa to, không tới VP được"
            >
              <p>Luôn <b>miễn phí</b> — không trừ phép, không trừ lương</p>
            </LeaveCard>

            <LeaveCard
              icon={Home}
              tone="violet"
              title="Làm online — WFH"
              desc="Work from home"
            >
              <ul className="list-disc pl-4 space-y-0.5">
                <li><b>3 ngày đầu/tháng</b> miễn phí</li>
                <li>Sau đó: <b>0.5 ngày phép</b> / ngày</li>
                <li>Hết phép → trừ <b>0.5 lương ngày</b> / ngày</li>
              </ul>
            </LeaveCard>

            <LeaveCard
              icon={Hourglass}
              tone="amber"
              title="Nghỉ theo giờ"
              desc="Đi việc riêng vài tiếng"
            >
              <p>Trừ lương: <b>lương/giờ × số giờ</b></p>
            </LeaveCard>

            <LeaveCard
              icon={CalendarOff}
              tone="rose"
              title="Nghỉ theo ngày"
              desc="Nghỉ trọn ngày"
            >
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Trừ vào <b>ngày phép</b></li>
                <li>Hết phép → trừ <b>lương ngày × số ngày vượt</b></li>
              </ul>
            </LeaveCard>
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-sm">Quy định chung</h3>
          <ul className="list-disc pl-5 text-sm text-neutral-700 mt-1.5 space-y-0.5">
            <li>Đơn cần admin duyệt mới có hiệu lực</li>
            <li>Có thể chọn nhiều ngày trong 1 đơn (vd nghỉ 29/4 + 1/5)</li>
            <li><b>Không gửi trùng</b>: nếu đã có đơn pending/approved cùng ngày + cùng loại → bị chặn</li>
            <li>Chỉ đơn <Code>approved</Code> mới trừ phép</li>
          </ul>
        </div>
      </section>

      {/* ===== Vắng không phép ===== */}
      <section className="rounded-2xl glass border border-white/60 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertTriangle size={18} />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">Vắng không phép</h2>
        </div>
        <ul className="list-disc pl-5 text-sm text-neutral-700 space-y-1">
          <li>
            Ngày làm việc (T2–T6, sáng T7) mà NV <b>không chấm công</b> + <b>không có đơn xin nghỉ</b> → tự động <b>trừ lương 1 ngày làm việc</b> (T7 trừ 0.5 ngày)
          </li>
          <li>
            Nếu NV thực tế đã làm nhưng quên chấm hoặc gặp lỗi app: <b>báo admin</b> để bổ sung chấm công cho ngày đó qua nút <Code>+ Thêm chấm công</Code>
          </li>
          <li>Sau khi admin thêm chấm công → ngày đó tự động không bị trừ lương nữa</li>
          <li>Admin cũng có thể <b>sửa giờ chấm công</b> nếu lỡ trễ do app load chậm — bản ghi sẽ có nhãn <b>"Đã sửa"</b></li>
        </ul>
      </section>

      <p className="text-xs text-neutral-400 text-center pt-2">
        Nội quy được cập nhật theo logic mới nhất của hệ thống chấm công Basso.
      </p>
    </main>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 text-[0.85em] font-mono">
      {children}
    </code>
  );
}

const LEAVE_TONE = {
  sky:    { iconBg: "bg-sky-50",    iconText: "text-sky-600",    border: "border-sky-100" },
  violet: { iconBg: "bg-violet-50", iconText: "text-violet-600", border: "border-violet-100" },
  amber:  { iconBg: "bg-amber-50",  iconText: "text-amber-600",  border: "border-amber-100" },
  rose:   { iconBg: "bg-rose-50",   iconText: "text-rose-600",   border: "border-rose-100" },
} as const;

function LeaveCard({
  icon: Icon,
  tone,
  title,
  desc,
  children,
}: {
  icon: React.ComponentType<{ size?: number }>;
  tone: keyof typeof LEAVE_TONE;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  const t = LEAVE_TONE[tone];
  return (
    <div className={`rounded-xl border ${t.border} bg-white p-3`}>
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 rounded-xl ${t.iconBg} ${t.iconText} flex items-center justify-center shrink-0`}>
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm leading-snug">{title}</h4>
          <p className="text-xs text-neutral-500 mt-0.5">{desc}</p>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-neutral-200/60 text-sm text-neutral-700">
        {children}
      </div>
    </div>
  );
}
