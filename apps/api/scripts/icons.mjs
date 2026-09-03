// Rasterize the Relay mark (public/favicon.svg) to the PNG sizes the manifest and iOS want.
// Pure Node: a tiny PNG encoder over a geometric render, so there is no image toolchain to
// install. Re-run after changing the mark: `node scripts/icons.mjs`.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const ACCENT = [0xb5, 0x45, 0x1b];
const PAPER = [0xfb, 0xfa, 0xf7];

// The mark in favicon.svg's 64-unit coordinate space.
const PLATE = { x: 0, y: 0, w: 64, h: 64, r: 14 };
const BARS = [
  { x: 8, y: 21, w: 34, h: 9, r: 4.5, a: 1 },
  { x: 22, y: 34, w: 34, h: 9, r: 4.5, a: 0.85 },
];

function roundedRect(px, py, { x, y, w, h, r }) {
  const cx = Math.max(x + r, Math.min(px, x + w - r));
  const cy = Math.max(y + r, Math.min(py, y + h - r));
  return Math.hypot(px - cx, py - cy) <= r;
}

function render(size) {
  const ss = 4; // supersampling per axis
  const scale = 64 / size;
  const px = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let plate = 0;
      let ink = 0;
      for (let sj = 0; sj < ss; sj++) {
        for (let si = 0; si < ss; si++) {
          const x = (i + (si + 0.5) / ss) * scale;
          const y = (j + (sj + 0.5) / ss) * scale;
          if (!roundedRect(x, y, PLATE)) continue;
          plate++;
          for (const b of BARS)
            if (roundedRect(x, y, b)) {
              ink += b.a;
              break;
            }
        }
      }
      const n = ss * ss;
      const cover = plate / n;
      const t = plate ? ink / plate : 0;
      const o = (j * size + i) * 4;
      for (let k = 0; k < 3; k++) px[o + k] = Math.round(ACCENT[k] + (PAPER[k] - ACCENT[k]) * t);
      px[o + 3] = Math.round(255 * cover);
    }
  }
  return px;
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let j = 0; j < size; j++) {
    raw[j * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(px.buffer, j * size * 4, size * 4).copy(raw, j * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  writeFileSync(join(OUT, name), png(size, render(size)));
  console.log(`${name} ${size}x${size}`);
}
