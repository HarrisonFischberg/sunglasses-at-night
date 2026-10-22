// The e2e pixel checks (e2e/filter.test.js) read Playwright screenshots with
// e2e/png.js; this checks that reader against hand-built PNGs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { decodePng } from '../../e2e/png.js';

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]); // CRC unchecked
}

// rows: arrays of [r,g,b(,a)] pixels; filters: per-row filter type applied on encode.
function encode(rows, channels, filters) {
  const w = rows[0].length, h = rows.length, stride = w * channels;
  const flat = rows.map((r) => Buffer.from(r.flat()));
  const lines = [];
  for (let y = 0; y < h; y++) {
    const f = filters[y], out = Buffer.alloc(stride + 1);
    out[0] = f;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? flat[y][x - channels] : 0;
      const b = y > 0 ? flat[y - 1][x] : 0;
      const c = x >= channels && y > 0 ? flat[y - 1][x - channels] : 0;
      let pred = 0;
      if (f === 1) pred = a;
      else if (f === 2) pred = b;
      else if (f === 3) pred = (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x + 1] = (flat[y][x] - pred) & 0xff;
    }
    lines.push(out);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(lines))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('decodePng: RGB and RGBA, all five row filters', () => {
  const rgb = [
    [[230, 200, 150], [40, 40, 60], [0, 0, 0]],
    [[255, 255, 255], [12, 34, 56], [200, 10, 99]],
    [[1, 2, 3], [250, 251, 252], [128, 128, 128]],
    [[90, 80, 70], [60, 50, 40], [30, 20, 10]],
    [[5, 250, 5], [250, 5, 250], [17, 17, 17]],
  ];
  for (const channels of [3, 4]) {
    const rows = rgb.map((r) => r.map((p) => (channels === 4 ? [...p, 255] : p)));
    const png = decodePng(encode(rows, channels, [0, 1, 2, 3, 4]));
    assert.equal(png.width, 3);
    assert.equal(png.height, 5);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) assert.deepEqual(png.at(x, y), rgb[y][x], `${channels}ch ${x},${y}`);
    assert.deepEqual(png.at(0.4, 1.4), rgb[1][0], 'fractional coordinates round');
  }
});

test('decodePng: rejects non-PNG input', () => {
  assert.throws(() => decodePng(Buffer.from('not a png at all')), /not a PNG/);
});
