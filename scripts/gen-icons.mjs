import sharp from "sharp";
import { readFileSync } from "node:fs";

const svg = readFileSync("public/icons/icon.svg");
for (const size of [192, 512, 180]) {
  const out = size === 180 ? "apple-touch-icon" : `icon-${size}`;
  await sharp(svg).resize(size, size).png().toFile(`public/icons/${out}.png`);
  console.log("→", `public/icons/${out}.png`);
}
