import Link from "next/link";
import { ArrowLeft, Clock, CalendarOff } from "lucide-react";

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
          <div className="rounded-xl border border-neutral-200 overflow-hidden text-sm">
            <table className="w-full">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-xs uppercase tracking-wider text-neutral-600">Loại</th>
                  <th className="text-left px-3 py-2 font-medium text-xs uppercase tracking-wider text-neutral-600">Mô tả</th>
                  <th className="text-left px-3 py-2 font-medium text-xs uppercase tracking-wider text-neutral-600">Tính chất</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/60">
                <tr>
                  <td className="px-3 py-2.5 font-medium align-top">Làm online — trời mưa</td>
                  <td className="px-3 py-2.5 text-neutral-700 align-top">Mưa to, không tới VP được</td>
                  <td className="px-3 py-2.5 text-neutral-700 align-top">Luôn miễn phí</td>
                </tr>
                <tr>
                  <td className="px-3 py-2.5 font-medium align-top">Làm online — WFH</td>
                  <td className="px-3 py-2.5 text-neutral-700 align-top">Work from home</td>
                  <td className="px-3 py-2.5 text-neutral-700 align-top">
                    3 ngày đầu/tháng miễn phí; sau đó <b>0.5 ngày phép/ngày</b>; hết phép → trừ <b>0.5 lương ngày</b>
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2.5 font-medium align-top">Nghỉ theo giờ</td>
                  <td className="px-3 py-2.5 text-neutral-700 align-top">Đi việc riêng vài tiếng</td>
                  <td className="px-3 py-2.5 text-neutral-700 align-top">Trừ lương: <b>lương/giờ × số giờ</b></td>
                </tr>
                <tr>
                  <td className="px-3 py-2.5 font-medium align-top">Nghỉ theo ngày</td>
                  <td className="px-3 py-2.5 text-neutral-700 align-top">Nghỉ trọn ngày</td>
                  <td className="px-3 py-2.5 text-neutral-700 align-top">
                    Trừ phép. Hết phép → trừ <b>lương ngày × số ngày vượt</b>
                  </td>
                </tr>
              </tbody>
            </table>
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
