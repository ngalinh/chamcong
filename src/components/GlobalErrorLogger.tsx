"use client";

import { useEffect } from "react";
import { installGlobalErrorLogger } from "@/lib/log";

export function GlobalErrorLogger() {
  useEffect(() => {
    installGlobalErrorLogger();
  }, []);
  return null;
}
