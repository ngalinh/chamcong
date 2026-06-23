"use client";

import { useEffect, useState } from "react";
import { formatVN } from "@/lib/time";

function compute() {
  const now = new Date();
  const hour = parseInt(formatVN(now, "H"), 10);
  const greeting =
    hour < 12 ? "Chào buổi sáng" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";
  const nowLabel = formatVN(now, "HH:mm · EEEE, d 'tháng' M, yyyy");
  return { greeting, nowLabel };
}

export function GreetingClock({ name }: { name: string }) {
  // Khởi tạo ngay với giá trị thật để tránh layout shift sau hydration.
  // suppressHydrationWarning cho phép server/client lệch nhau (timezone ok).
  const [state, setState] = useState(compute);

  useEffect(() => {
    const id = setInterval(() => setState(compute()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <p className="text-xs uppercase tracking-[0.15em] text-neutral-400 font-medium" suppressHydrationWarning>
        {state.greeting}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
      <p className="text-xs text-neutral-500 mt-0.5 tabular-nums" suppressHydrationWarning>
        {state.nowLabel}
      </p>
    </>
  );
}
