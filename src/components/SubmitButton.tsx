"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Submit button có hiển thị spinner ngay khi click (dựa vào useFormStatus
 * từ form bao quanh). Disable khi pending để chống double submit.
 *
 * Đặt INSIDE <form action={...}> để useFormStatus đọc được state.
 */
export function SubmitButton({
  children,
  className,
  pendingLabel,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingLabel?: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || props.disabled}
      className={cn(className, pending && "opacity-70 cursor-wait")}
      {...props}
    >
      {pending ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
