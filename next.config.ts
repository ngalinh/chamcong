import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // face-api uses util.TextEncoder which Turbopack shims away in SSR bundles → run natively
  serverExternalPackages: ["@vladmandic/face-api"],
  reactStrictMode: true,
  // Tạo standalone bundle để Docker image gọn (~150 MB thay vì ~1 GB)
  output: "standalone",
  allowedDevOrigins: ["*.trycloudflare.com", "*.loca.lt"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self)" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        // Face-api weights — content-addressed (đổi file = đổi tên), an toàn để cache vĩnh viễn.
        // Backup cho SW cache: nếu SW miss / bị uninstall, browser HTTP cache vẫn giữ.
        source: "/models/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
