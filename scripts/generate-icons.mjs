// Generate PWA icons với fingerprint icon trên gradient indigo→purple
// Chạy: node scripts/generate-icons.mjs
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * SVG cho PWA icon: gradient indigo→purple full background +
 * dấu vân tay trắng ở giữa (path từ lucide-react Fingerprint).
 * Padding ~20% để không chạm cạnh khi maskable crop tròn.
 */
function buildSvg(size) {
  const padding = Math.round(size * 0.18);
  const iconSize = size - padding * 2;
  // Gradient + lucide Fingerprint icon, scale từ viewBox 24 lên iconSize
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="#6366f1"/>
      <stop offset="60%"  stop-color="#5b21b6"/>
      <stop offset="100%" stop-color="#4c1d95"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <g transform="translate(${padding}, ${padding}) scale(${iconSize / 24})"
     fill="none" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/>
    <path d="M14 13.12c0 2.38 0 6.38-1 8.88"/>
    <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/>
    <path d="M2 12a10 10 0 0 1 18-6"/>
    <path d="M2 16h.01"/>
    <path d="M21.8 16c.2-2 .131-5.354 0-6"/>
    <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/>
    <path d="M8.65 22c.21-.66.45-1.32.57-2"/>
    <path d="M9 6.8a6 6 0 0 1 9 5.2v2"/>
  </g>
</svg>`;
}

const targets = [
  { size: 192, file: "public/icons/icon-192.png" },
  { size: 512, file: "public/icons/icon-512.png" },
  { size: 180, file: "public/icons/apple-touch-icon.png" },
  { size: 512, file: "public/icons/source.png" }, // master, có thể tái dùng
];

mkdirSync(`${ROOT}/public/icons`, { recursive: true });

for (const { size, file } of targets) {
  const svg = buildSvg(size);
  const out = `${ROOT}/${file}`;
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
  console.log(`✓ ${file} (${size}x${size})`);
}

// Cũng lưu SVG master để dễ chỉnh sau
writeFileSync(`${ROOT}/public/icons/icon.svg`, buildSvg(512));
console.log("✓ public/icons/icon.svg");
