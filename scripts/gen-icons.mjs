import sharp from "sharp";
import { readFileSync } from "node:fs";

// Nguồn: public/icons/source.png (user-provided, 2000x2000)
const src = readFileSync("public/icons/source.png");

const sizes = [
  { size: 192, name: "icon-192" },
  { size: 512, name: "icon-512" },
  { size: 180, name: "apple-touch-icon" },
];

for (const { size, name } of sizes) {
  await sharp(src).resize(size, size).png({ quality: 95 }).toFile(`public/icons/${name}.png`);
  console.log("→", `public/icons/${name}.png`);
}
