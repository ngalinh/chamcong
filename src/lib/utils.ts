import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

export function isAllowedDomain(email: string): boolean {
  const dom = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN?.trim().toLowerCase();
  if (!dom) return true;
  return email.toLowerCase().endsWith("@" + dom);
}
