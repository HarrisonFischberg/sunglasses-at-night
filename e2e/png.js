// Minimal PNG reader for e2e pixel checks on Playwright screenshots
// (8-bit RGB or RGBA, non-interlaced). Node built-ins only, no network.

import { inflateSync, deflateSync, crc32 } from 'node:zlib';

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8, width = 0, height = 0, colorType = 0, depth = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const channels = { 2: 3, 6: 4 }[colorType];
  if (depth !== 8 || !channels || interlace) throw new Error(`unsupported PNG (depth ${depth}, type ${colorType}, interlace ${interlace})`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = (line[x] + pred) & 0xff;
    }
  }
  return {
    width, height,
    /** [r, g, b] at integer (x, y). */
    at(x, y) {
      const i = Math.round(y) * stride + Math.round(x) * channels;
      return [px[i], px[i + 1], px[i + 2]];
    },
  };
}

/** Encode 8-bit RGBA pixels (Buffer, width*height*4) as a PNG. */
export function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Pixels that differ between two same-size screenshots, outside `mask`
 * rectangles ({x, y, width, height}, CSS px = device px here). Returns the
 * count and a diff PNG: changed pixels red, masked areas blue, the rest dimmed.
 */
export function diffPng(aBuf, bBuf, masks = []) {
  const a = decodePng(aBuf), b = decodePng(bBuf);
  if (a.width !== b.width || a.height !== b.height) return { changed: Infinity, png: null, size: `${a.width}x${a.height} vs ${b.width}x${b.height}` };
  const inMask = (x, y) => masks.some((m) => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height);
  const out = Buffer.alloc(a.width * a.height * 4);
  let changed = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const p = a.at(x, y), q = b.at(x, y), i = (y * a.width + x) * 4;
      const masked = inMask(x, y);
      const diff = p[0] !== q[0] || p[1] !== q[1] || p[2] !== q[2];
      if (diff && !masked) changed++;
      const [r, g, bl] = masked ? [40, 80, 200] : diff ? [255, 0, 0] : p.map((v) => 64 + (v >> 2));
      out[i] = r; out[i + 1] = g; out[i + 2] = bl; out[i + 3] = 255;
    }
  }
  return { changed, png: encodePng(a.width, a.height, out) };
}
