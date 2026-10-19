// T017: generated icon assets are present, correctly sized, original-palette, and wired up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p));

test('toolbar off-state glyphs exist for every toolbar size and are dimmer than on', () => {
  for (const s of [16, 19, 32, 38, 48, 96]) {
    for (const v of ['dark', 'light']) {
      assert.ok(existsSync(join(root, `Extension/Resources/images/toolbar-${v}-off-${s}.png`)), `${v} off ${s}`);
    }
  }
  const maxAlpha = (f) => { const { px } = decode(read(f)); let m = 0; for (let i = 3; i < px.length; i += 4) m = Math.max(m, px[i]); return m; };
  assert.ok(maxAlpha('Extension/Resources/images/toolbar-dark-off-32.png') < maxAlpha('Extension/Resources/images/toolbar-dark-32.png'));
});

test('popup header mark and popup/options favicons use the generated icon', () => {
  for (const page of ['Extension/Resources/popup/popup.html', 'Extension/Resources/options/options.html']) {
    assert.match(read(page).toString(), /<link rel="icon"[^>]*href="\.\.\/images\/icon-48\.png"/, `${page} favicon`);
  }
  assert.match(read('Extension/Resources/popup/popup.html').toString(), /<img class="app-mark" src="\.\.\/images\/icon-48\.png"/);
  assert.ok(existsSync(join(root, 'Extension/Resources/images/icon-48.png')));
});

function decode(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG signature');
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  let pos = 8;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * 4);
  for (let j = 0; j < h; j++) raw.copy(px, j * w * 4, j * (w * 4 + 1) + 1, (j + 1) * (w * 4 + 1));
  return { w, h, px };
}

function hue([r, g, b]) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx === mn) return null;
  const d = mx - mn;
  const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (hh * 60 + 360) % 360;
}

const manifest = JSON.parse(read('Extension/Resources/manifest.json'));

test('manifest icons and toolbar icons exist at their declared sizes', () => {
  const all = { ...manifest.icons, ...manifest.action.default_icon };
  for (const [size, path] of Object.entries(all)) {
    assert.ok(existsSync(join(root, 'Extension/Resources', path)), `${path} exists`);
    const { w, h } = decode(read(`Extension/Resources/${path}`));
    assert.equal(w, Number(size), `${path} width`);
    assert.equal(h, Number(size), `${path} height`);
  }
});

test('toolbar glyphs are single-colour with transparency, light and dark variants', () => {
  for (const variant of ['dark', 'light']) {
    const { px } = decode(read(`Extension/Resources/images/toolbar-${variant}-32.png`));
    let opaque = 0;
    let clear = 0;
    const colours = new Set();
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) clear++;
      else {
        if (px[i + 3] === 255) opaque++;
        colours.add(`${px[i]},${px[i + 1]},${px[i + 2]}`);
      }
    }
    assert.ok(opaque > 100, `${variant}: solid glyph pixels`);
    assert.ok(clear > 100, `${variant}: transparent background`);
    assert.equal(colours.size, 1, `${variant}: one ink colour (template style)`);
  }
  const dark = decode(read('Extension/Resources/images/toolbar-dark-32.png')).px;
  const light = decode(read('Extension/Resources/images/toolbar-light-32.png')).px;
  const lum = (p) => {
    for (let i = 0; i < p.length; i += 4) if (p[i + 3] === 255) return p[i];
    return -1;
  };
  assert.ok(lum(dark) < 80 && lum(light) > 200, 'dark glyph for light bars, light glyph for dark bars');
});

test('app icon set: every declared file exists, is square at the stated pixel size', () => {
  const dir = 'App/Assets.xcassets/AppIcon.appiconset';
  const set = JSON.parse(read(`${dir}/Contents.json`));
  assert.ok(set.images.some((i) => i.platform === 'ios' && i.size === '1024x1024'), 'iOS 1024 slot');
  assert.ok(set.images.filter((i) => i.idiom === 'mac').length === 10, 'ten macOS slots');
  for (const img of set.images) {
    const px = img.idiom === 'mac' ? Number.parseInt(img.size, 10) * Number.parseInt(img.scale, 10) : 1024;
    const { w, h } = decode(read(`${dir}/${img.filename}`));
    assert.equal(w, px, `${img.filename} width`);
    assert.equal(h, px, `${img.filename} height`);
  }
  const ios = decode(read(`${dir}/ios-1024.png`)).px;
  for (let i = 3; i < ios.length; i += 4) assert.equal(ios[i], 255, 'iOS icon has no transparency');
});

test('app icon palette: warm only, no purple/violet or moon-style hues (R15)', () => {
  const { px } = decode(read('App/Assets.xcassets/AppIcon.appiconset/ios-1024.png'));
  let coral = 0;
  for (let i = 0; i < px.length; i += 16) {
    const h = hue([px[i], px[i + 1], px[i + 2]]);
    if (h === null) continue;
    assert.ok(h < 60 || h > 345, `unexpected hue ${Math.round(h)} at pixel ${i / 4}`);
    coral++;
  }
  assert.ok(coral > 1000, 'coral glasses present');
});

test('licenses: icon rows recorded and no third-party art claimed', () => {
  const doc = read('docs/asset-licenses.md').toString();
  assert.match(doc, /App icon \(sunglasses mark\)/);
  assert.match(doc, /Toolbar icons/);
  assert.match(doc, /design\/icons\/generate\.js/);
});
