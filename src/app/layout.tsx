import "./globals.css";
import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { BadgeClearer } from "@/components/BadgeClearer";
import { PushToaster } from "@/components/PushToaster";

export const metadata: Metadata = {
  title: "Chấm công",
  description: "Hệ thống chấm công nhân viên",
  manifest: "/manifest.json",
  applicationName: "Chấm công",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Chấm công",
    startupImage: [],
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f5" },
    { media: "(prefers-color-scheme: dark)",  color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        {children}
        <ServiceWorkerRegister />
        <BadgeClearer />
        <PushToaster />
      </body>
    </html>
  );
}
