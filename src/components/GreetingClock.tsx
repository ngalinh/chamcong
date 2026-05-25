"use client";

import { useEffect, useState } from "react";
import { formatVN } from "@/lib/time";

export function GreetingClock({ name }: { name: string }) {
  const [state, setState] = useState<{ greeting: string; nowLabel: string } | null>(null);

  useEffect(() => {
    function tick() {
      const now = new Date();
      const hour = parseInt(formatVN(now, "H"), 10);
      const greeting =
        hour < 12 ? "Chào buổi sáng" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";
      const nowLabel = formatVN(now, "HH:mm · EEEE, d 'tháng' M, yyyy");
      setState({ greeting, nowLabel });
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <p className="text-xs uppercase tracking-[0.15em] text-neutral-400 font-medium">
        {state?.greeting ?? " "}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
      <p className="text-xs text-neutral-500 mt-0.5 tabular-nums">
        {state?.nowLabel ?? " "}
      </p>
    </>
  );
}
