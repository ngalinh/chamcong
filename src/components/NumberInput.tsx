"use client";
import { useState } from "react";

export function NumberInput({
  name,
  defaultValue,
  placeholder = "0",
  className,
}: {
  name: string;
  defaultValue?: number;
  placeholder?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(
    defaultValue ? defaultValue.toLocaleString("vi-VN") : ""
  );

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^\d]/g, "");
    setDisplay(raw ? Number(raw).toLocaleString("vi-VN") : "");
  }

  const rawValue = display.replace(/[^\d]/g, "");

  return (
    <>
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        className={className}
      />
      {/* hidden input giữ giá trị số thô để server action đọc */}
      <input type="hidden" name={name} value={rawValue} />
    </>
  );
}
