// Generates every Sunglasses for Safari icon from one geometry. No third-party art.
// Run: node design/icons/generate.js
// Output: App/Assets.xcassets/AppIcon.appiconset, Extension/Resources/images/*.png
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Geometry in a 100x100 box: two lenses, a bridge, two temple arms.
const LENS_L = { x: 10, y: 36, w: 34, h: 28, rt: 5, rb: 14 };
const LENS_R = { x: 56, y: 36, w: 34, h: 28, rt: 5, rb: 14 };

function inLens(l, px, py) {
  const x = px - l.x;
  const y = py - l.y;
  if (x < 0 || y < 0 || x > l.w || y > l.h) return false;
  const corner = (cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  if (x < l.rt && y < l.rt) return corner(l.rt, l.rt, l.rt);
  if (x > l.w - l.rt && y < l.rt) return corner(l.w - l.rt, l.rt, l.rt);
  if (x < l.rb && y > l.h - l.rb) return corner(l.rb, l.h - l.rb, l.rb);
  if (x > l.w - l.rb && y > l.h - l.rb) return corner(l.w - l.rb, l.h - l.rb, l.rb);
  return true;
}

function inBridge(px, py) {
  if (px < 44 || px > 56) return false;
  const centre = 42 - 5 * Math.sin(((px - 44) / 12) * Math.PI);
  return Math.abs(py - centre) <= 2.4;
}

function inArm(px, py) {
  // Short temple arms running outward from the top outer corners.
  const left = px >= 2 && px <= 12 && Math.abs(py - (38.5 - (12 - px) * 0.25)) <= 2.4;
  const right = px >= 88 && px <= 98 && Math.abs(py - (38.5 - (px - 88) * 0.25)) <= 2.4;
  return left || right;
}

// Glasses silhouette (frames filled).
const glasses = (x, y) => inLens(LENS_L, x, y) || inLens(LENS_R, x, y) || inBridge(x, y) || inArm(x, y);

// Highlight: a diagonal glint band across each lens.
function glint(x, y) {
  for (const l of [LENS_L, LENS_R]) {
    if (!inLens(l, x, y)) continue;
    const u = x - l.x;
    const v = y - l.y;
    const d = u - v * 0.9 - 8;
    if (d >= 0 && d <= 3.2 && v > 4 && v < l.h - 7) return true;
  }
  return false;
}

// Lens cut-out for the monochrome toolbar glyph: the lenses stay solid, a thin
// gap separates the glint so the shape reads at 16 px.
const toolbarMark = (x, y) => glasses(x, y) && !glint(x, y);

function render(size, sample, { pad = 0, scale = 1 } = {}) {
  const ss = 4;
  const px = new Uint8Array(size * size * 4);
  const span = 100 / (1 - 2 * pad) / scale;
  const off = (100 - span) / 2;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const acc = [0, 0, 0, 0];
      for (let sj = 0; sj < ss; sj++) {
        for (let si = 0; si < ss; si++) {
          const gx = off + ((i + (si + 0.5) / ss) / size) * span;
          const gy = off + ((j + (sj + 0.5) / ss) / size) * span;
          const c = sample(gx, gy, i / size, j / size);
          acc[0] += c[0] * c[3];
          acc[1] += c[1] * c[3];
          acc[2] += c[2] * c[3];
          acc[3] += c[3];
        }
      }
      const n = ss * ss;
      const a = acc[3] / n;
      const o = (j * size + i) * 4;
      if (acc[3] > 0) {
        px[o] = Math.round(acc[0] / acc[3]);
        px[o + 1] = Math.round(acc[1] / acc[3]);
        px[o + 2] = Math.round(acc[2] / acc[3]);
      }
      px[o + 3] = Math.round(a * 255);
    }
  }
  return px;
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let j = 0; j < size; j++) {
    raw[j * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, j * size * 4, size * 4).copy(raw, j * (size * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const CORAL = hex('#ff9a76');
const CORAL_DEEP = hex('#e0714c');
const GLINT = hex('#ffe3d6');
const BG_TOP = hex('#3a3430');
const BG_BOTTOM = hex('#1f1b19');
const mix = (a, b, t) => a.map((v, k) => Math.round(v + (b[k] - v) * t));

// App icon: full-bleed warm charcoal square (the OS applies the mask), coral glasses.
function glyphColour(gx, gy) {
  if (glint(gx, gy)) return GLINT;
  if (glasses(gx, gy)) return mix(CORAL, CORAL_DEEP, Math.max(0, Math.min(1, (gy - 36) / 28)));
  return null;
}
// iOS / listing: full-bleed square, the OS applies its own mask.
function appIcon(gx, gy, u, v) {
  return [...(glyphColour(gx, gy) ?? mix(BG_TOP, BG_BOTTOM, v)), 1];
}
// macOS: rounded tile inset on a transparent canvas (824/1024 as in Apple's grid).
const MAC_PAD = 0.2;
function macIcon(gx, gy) {
  const g = glyphColour(gx, gy);
  if (g) return [...g, 1];
  const half = (824 / 1024 / 2) * (100 / (1 - 2 * MAC_PAD));
  const dx = Math.abs(gx - 50);
  const dy = Math.abs(gy - 50);
  const r = half * 0.225;
  const qx = Math.max(dx - (half - r), 0);
  const qy = Math.max(dy - (half - r), 0);
  const inside = dx <= half && dy <= half && qx * qx + qy * qy <= r * r;
  return inside ? [...mix(BG_TOP, BG_BOTTOM, (gy - (50 - half)) / (2 * half)), 1] : [0, 0, 0, 0];
}

const ink = (rgb) => (gx, gy) => (toolbarMark(gx, gy) ? [...rgb, 1] : [0, 0, 0, 0]);
const write = (path, buf) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
};

// App icon set (macOS sizes + a universal 1024 for iOS).
const appset = join(root, 'App', 'Assets.xcassets', 'AppIcon.appiconset');
const macSizes = [16, 32, 64, 128, 256, 512, 1024];
const images = [];
for (const s of macSizes) {
  write(join(appset, `icon-${s}.png`), png(s, render(s, macIcon, { pad: MAC_PAD })));
}
write(join(appset, 'ios-1024.png'), png(1024, render(1024, appIcon, { pad: 0.14 })));
for (const base of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    images.push({ size: `${base}x${base}`, idiom: 'mac', filename: `icon-${base * scale}.png`, scale: `${scale}x` });
  }
}
images.push({ size: '1024x1024', idiom: 'universal', platform: 'ios', filename: 'ios-1024.png' });
write(join(appset, 'Contents.json'), Buffer.from(JSON.stringify({ images, info: { version: 1, author: 'xcode' } }, null, 2) + '\n'));
write(join(root, 'App', 'Assets.xcassets', 'Contents.json'), Buffer.from(JSON.stringify({ info: { version: 1, author: 'xcode' } }, null, 2) + '\n'));

// Safari toolbar + extension list icons. "dark" = dark glyph for light toolbars.
const imgDir = join(root, 'Extension', 'Resources', 'images');
const toolbarSizes = [16, 19, 32, 38, 48, 64, 96, 128, 256, 512];
for (const s of toolbarSizes) {
  write(join(imgDir, `toolbar-dark-${s}.png`), png(s, render(s, ink([28, 28, 30]), { pad: 0.02 })));
  write(join(imgDir, `toolbar-light-${s}.png`), png(s, render(s, ink([245, 245, 247]), { pad: 0.02 })));
}
// Extension list / store listing icon: the coloured app icon.
for (const s of [48, 96, 128, 256, 512]) {
  write(join(imgDir, `icon-${s}.png`), png(s, render(s, appIcon, { pad: 0.14 })));
}
console.log('icons generated');
