// Generates the synthetic fixture images (run once; outputs are committed
// with the fixtures). Deterministic: a seeded PRNG, no network.
import { writeFileSync, mkdirSync } from 'node:fs';
import { encodePng } from '../lib/png-encode.js';
const dir = new URL('./img/', import.meta.url);
mkdirSync(dir, { recursive: true });
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
// "Photo": saturated sky-to-sunset gradient with a sun disc and grain.
writeFileSync(new URL('photo.png', dir), encodePng(480, 320, (x, y) => {
  const t = y / 320, d = Math.hypot(x - 330, y - 200);
  let r = 40 + 200 * t, g = 90 + 60 * (1 - t), b = 200 - 140 * t;
  if (d < 50) { r = 255; g = 210; b = 80; }
  if (y > 250) { r = 30 + x / 10; g = 110; b = 50; }
  const n = (rnd() - 0.5) * 24;
  return [clamp(r + n), clamp(g + n), clamp(b + n), 255];
}));
// Product shot on a white studio background (the common ecommerce case).
writeFileSync(new URL('product-white.png', dir), encodePng(300, 300, (x, y) => {
  const inBottle = Math.abs(x - 150) < 45 && y > 70 && y < 260 || Math.abs(x - 150) < 18 && y > 35 && y <= 70;
  if (!inBottle) return [255, 255, 255, 255];
  const s = 1 - Math.abs(x - 150) / 60;
  return [clamp(20 + 40 * s), clamp(120 + 100 * s), clamp(200 + 40 * s), 255];
}));
// Transparent logo: black glyph blocks on a transparent background.
writeFileSync(new URL('logo-dark-transparent.png', dir), encodePng(240, 60, (x, y) => {
  const bar = (y > 10 && y < 50) && ((x % 40) < 26);
  return bar ? [10, 10, 10, 255] : [0, 0, 0, 0];
}));
// Colored transparent icon (should keep its colors).
writeFileSync(new URL('icon-color-transparent.png', dir), encodePng(64, 64, (x, y) => {
  const d = Math.hypot(x - 32, y - 32);
  return d < 28 ? [230, 60, 60, 255] : d < 30 ? [230, 60, 60, 120] : [0, 0, 0, 0];
}));
console.log('fixture images written');
