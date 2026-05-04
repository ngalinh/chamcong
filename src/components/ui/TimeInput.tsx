"use client";

import { useState } from "react";

/**
 * Input giờ 24h thuần text — không phụ thuộc locale device (iOS Settings 12/24h).
 * Auto-insert ":" giữa chữ số: "2000" → "20:00".
 *
 * Hỗ trợ 2 mode:
 *   - Controlled: truyền value + onChange
 *   - Uncontrolled: truyền defaultValue + name (cho server-rendered form)
 */
export function TimeInput(props: {
  className?: string;
  required?: boolean;
  placeholder?: string;
  name?: string;
  id?: string;
} & (
  | { value: string; onChange: (v: string) => void; defaultValue?: undefined }
  | { defaultValue: string; value?: undefined; onChange?: undefined }
)) {
  const [internal, setInternal] = useState((props.defaultValue ?? "").slice(0, 5));
  const isControlled = props.value !== undefined;
  const value = isControlled ? props.value! : internal;

  function setValue(v: string) {
    if (isControlled) props.onChange!(v);
    else setInternal(v);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const cleaned = raw.replace(/[^0-9:]/g, "");
    const digits = cleaned.replace(/:/g, "").slice(0, 4);
    if (digits.length === 0) setValue("");
    else if (digits.length <= 2) setValue(digits);
    else setValue(`${digits.slice(0, 2)}:${digits.slice(2)}`);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={props.placeholder ?? "HH:MM"}
      maxLength={5}
      value={value}
      onChange={handleChange}
      pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
      title="Định dạng 24h, vd 20:00"
      className={props.className}
      required={props.required}
      name={props.name}
      id={props.id}
    />
  );
}
