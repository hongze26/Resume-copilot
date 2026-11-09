// 生成扩展图标（纯 Node，不依赖图像库）：红色圆角方块 + 白色文档与对勾。
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const RED = [180, 35, 24, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

function pixel(x, y, s) {
  const u = x / s;
  const v = y / s;
  if (!inRoundRect(u, v, 0.02, 0.02, 0.98, 0.98, 0.2)) return CLEAR;
  // 文档
  const inDoc = inRoundRect(u, v, 0.26, 0.18, 0.74, 0.84, 0.06);
  if (inDoc) {
    // 文本行（红）
    const lines = [0.32, 0.44];
    for (const ly of lines) if (v > ly - 0.03 && v < ly + 0.03 && u > 0.34 && u < 0.66) return RED;
    // 对勾（红）
    const w = s <= 16 ? 0.07 : 0.05;
    if (distToSegment(u, v, 0.36, 0.64, 0.46, 0.73) < w || distToSegment(u, v, 0.46, 0.73, 0.64, 0.55) < w) return RED;
    return WHITE;
  }
  return RED;
}

mkdirSync(new URL('../src/icons/', import.meta.url), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(new URL(`../src/icons/${size}.png`, import.meta.url), png(size, pixel));
}
console.log('icons generated');
