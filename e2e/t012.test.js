// T012 acceptance on WebKit, over the 8 fixture pages (light, already-dark,
// inline styles, SPA mutations, images, cross-origin sheet, links, shop
// buttons), the shadow-DOM page, and the original "hard cases" page:
//   - first paint is not white: the server holds the body back; the canvas
//     is read in the first frame WebKit renders (WebKit renders none while
//     the body is empty) and the screen just after it has no white areas;
//   - every visible text node, in every frame, is ≥ 4.5:1 on a dark
//     background (page-audit.js, computed colors);
//   - every enabled button passes Playwright's actionability checks (visible,
//     stable, enabled, receives the pointer event), plus real clicks;
//   - hard cases: media in links, figures, nested frames, translucent /
//     transitioned / `all: revert` / `filter: none` images, url() and data:
//     backgrounds, picture, canvas, embed, object and image inputs show as
//     authored on screenshot pixels: not inverted, hidden or faded;
//   - already-dark: the engine leaves the page exactly as authored.
// Screenshots and a JSON summary go to ralph/evidence/t012-*.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { startServers, launch, openPage, openFirstPaint, evidencePath, auditBundle } from './harness.js';
import { decodePng } from './png.js';
import { relativeLuminance } from '../engine/src/color.js';

const FIXTURES = [
  { name: 'light', path: '/light.html' },
  { name: 'already-dark', path: '/already-dark.html', alreadyDark: true },
  { name: 'inline', path: '/inline.html' },
  { name: 'spa', path: '/spa.html' },
  { name: 'images', path: '/images.html' },
  { name: 'cross-origin', path: '/cross-origin.html' },
  { name: 'links', path: '/links.html' },
  { name: 'shop', path: '/shop.html' },
  { name: 'shadow', path: '/shadow.html' },
  { name: 'hard-cases', path: '/hard-cases.html' },
];

const AUTHORED = { light: [230, 200, 150], dark: [40, 40, 60] };
const TOL = 12;
const BUTTONS = [
  'button', 'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]', 'input[type="image"]', '[role="button"]', 'summary',
].map((s) => `${s}:not(:disabled)`).join(',');

let servers, browser;
const summary = {};

before(async () => {
  servers = await startServers();
  browser = await launch();
});

after(async () => {
  await browser?.close();
  await servers?.close();
  if (!Object.keys(summary).length) return; // nothing ran: write no evidence
  summary._meta = { engine: 'webkit (Playwright 1.64.1)', date: new Date().toISOString() };
  writeFileSync(evidencePath('t012-e2e.json'), JSON.stringify(summary, null, 2) + '\n');
});

const lum = ([r, g, b]) => relativeLuminance({ r: r / 255, g: g / 255, b: b / 255, alpha: 1 });
const near = (a, b, tol = TOL) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const record = (name, key, value) => { (summary[name] ??= {})[key] = value; };

// Luminance over a 6×6 grid of viewport pixels.
function paintStats(buf) {
  const png = decodePng(buf);
  let max = 0, min = 1, white = 0;
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      const l = lum(png.at(((i + 0.5) * png.width) / 6, ((j + 0.5) * png.height) / 6));
      max = Math.max(max, l);
      min = Math.min(min, l);
      if (l > 0.9) white++;
    }
  }
  return { max: +max.toFixed(3), min: +min.toFixed(3), white };
}

// page-audit in every frame (about:blank frames may not get init scripts).
async function auditFrames(page) {
  const out = [];
  for (const frame of page.frames()) {
    if (frame.isDetached()) continue;
    // HTML documents only: the SVG embed/object documents hold no text.
    const kind = await frame.evaluate(() => document.contentType).catch(() => null);
    if (kind !== 'text/html') continue;
    let has = await frame.evaluate(() => typeof globalThis.__sanAudit === 'object');
    if (!has) {
      await frame.addScriptTag({ content: auditBundle() });
      has = await frame.evaluate(() => typeof globalThis.__sanAudit === 'object');
    }
    assert.ok(has, `could not audit frame ${frame.url()}`);
    const r = await frame.evaluate(() => __sanAudit.audit());
    out.push({ url: frame.url().replace(servers.SITE, ''), top: frame === page.mainFrame(), kind, ...r });
  }
  return out;
}

// Actionability of every enabled button in every frame: Playwright's trial
// click fails when the target is hidden, moving, disabled, or would not get
// the pointer event (something covers it).
async function trialClickAll(page) {
  let clickable = 0;
  const failures = [];
  for (const frame of page.frames()) {
    if (frame.isDetached()) continue;
    const loc = frame.locator(BUTTONS);
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      try {
        await el.click({ trial: true, timeout: 5000 });
        clickable++;
      } catch (err) {
        failures.push({ frame: frame.url().replace(servers.SITE, ''), el: await el.evaluate((e) => e.outerHTML.slice(0, 80)).catch(() => '?'), err: String(err.message).split('\n')[0] });
      }
    }
  }
  return { clickable, failures };
}

// Media sample points from every frame, in top-document coordinates (what
// a full-page screenshot shows).
async function mediaPoints(page) {
  const out = [];
  for (const frame of page.frames()) {
    const pts = await frame.evaluate(() => {
      let ox = 0, oy = 0, w = window;
      while (w.frameElement) {
        const fe = w.frameElement, r = fe.getBoundingClientRect(), cs = w.parent.getComputedStyle(fe);
        ox += r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
        oy += r.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop);
        w = w.parent;
      }
      ox += w.scrollX;
      oy += w.scrollY;
      return [...document.querySelectorAll('[data-expect]')].map((el) => {
        const r = el.getBoundingClientRect();
        const p = { id: el.id, expect: el.dataset.expect, x: ox + r.left + r.width / 2, y: oy + r.top + r.height / 2 };
        if (el.dataset.alpha) Object.assign(p, { alpha: Number(el.dataset.alpha), nx: ox + r.left - 6, ny: oy + r.top - 6 });
        return p;
      });
    }).catch(() => []);
    out.push(...pts);
  }
  return out;
}

async function sampleMedia(page, shot) {
  const points = await mediaPoints(page);
  const png = decodePng(await page.screenshot({ path: shot, fullPage: true }));
  return points.map((p) => ({ ...p, px: png.at(p.x, p.y), ...(p.alpha ? { around: png.at(p.nx, p.ny) } : {}) }));
}

// Each media point shows its authored color; translucent media are
// composited over the pixels around them at their authored opacity.
function mediaWrong(samples) {
  return samples.filter((s) => {
    const c = AUTHORED[s.expect];
    const want = s.alpha ? c.map((v, i) => s.alpha * v + (1 - s.alpha) * s.around[i]) : c;
    s.expected = want.map(Math.round);
    return !near(s.px, want, s.alpha ? TOL + 4 : TOL);
  }).map((s) => ({ id: s.id, px: s.px, expected: s.expected }));
}

// ------------------------------------------------------------- first paint

// Pixels right after the first rendered frame; null if WebKit won't take the
// screenshot yet (Playwright waits for document.fonts.ready first).
async function firstFrameShot(page, path) {
  try {
    return paintStats(await page.screenshot({ path, timeout: 5000 }));
  } catch {
    return null;
  }
}

for (const fx of FIXTURES) {
  test(`${fx.name}: first paint is not white`, { timeout: 60000 }, async () => {
    const plain = await openFirstPaint(browser, servers, fx.path);
    const basePx = await firstFrameShot(plain.page);
    await plain.context.close();

    const dark = await openFirstPaint(browser, servers, fx.path, { extension: true });
    const px = await firstFrameShot(dark.page, evidencePath(`t012-firstpaint-${fx.name}.png`));
    await dark.context.close();
    record(fx.name, 'firstPaint', { baseline: { canvas: plain.canvas, pixels: basePx }, extension: { canvas: dark.canvas, pixels: px } });

    // Without the extension the first frame is light, so the check can tell.
    if (!fx.alreadyDark) assert.ok(plain.canvas.luminance > 0.5, `baseline canvas not light (${JSON.stringify(plain.canvas)})`);
    // The first frame the browser rendered, with the extension, is dark...
    assert.ok(dark.canvas.luminance < 0.1, `first paint canvas not dark: ${JSON.stringify(dark.canvas)}`);
    // ...and the screen just after it has no white areas.
    assert.ok(px, 'no screenshot of the first frame');
    assert.equal(px.white, 0, `first paint pixels: ${px.white} of 36 samples near white (${JSON.stringify(px)})`);
  });
}

// -------------------------------------------- readable, buttons, as authored

for (const fx of FIXTURES) {
  test(`${fx.name}: every text node ≥ 4.5:1, buttons clickable${fx.alreadyDark ? ', left as authored' : ''}`, { timeout: 120000 }, async () => {
    let baseline = null;
    if (fx.alreadyDark || fx.name === 'hard-cases') {
      const plain = await openPage(browser, servers, fx.path);
      baseline = {
        styles: await plain.page.evaluate(styleSignature),
        media: fx.name === 'hard-cases' ? await sampleMedia(plain.page, evidencePath(`t012-${fx.name}-before.png`)) : null,
      };
      await plain.context.close();
    }

    const { page, context } = await openPage(browser, servers, fx.path, {
      extension: true, ready: fx.alreadyDark ? null : 'override',
    });
    const media = fx.name === 'hard-cases' ? await sampleMedia(page, evidencePath(`t012-${fx.name}-after.png`)) : null;
    if (!media) await page.screenshot({ path: evidencePath(`t012-${fx.name}-after.png`), fullPage: true });
    const audits = await auditFrames(page);
    const top = audits.find((a) => a.top);
    const clicks = await trialClickAll(page);
    record(fx.name, 'audit', audits);
    record(fx.name, 'buttons', clicks);

    // Readable and dark, in every frame.
    assert.ok(top.rootLuminance < 0.1, `root canvas luminance ${top.rootLuminance}`);
    assert.ok(audits.reduce((n, a) => n + a.checked, 0) > 0, 'no text checked');
    for (const a of audits) assert.deepEqual(a.failures, [], `${a.url}: ${a.failures.length} text element(s) not dark/readable`);

    // Every enabled button can be clicked.
    assert.deepEqual(clicks.failures, [], 'buttons not clickable');

    if (fx.alreadyDark) {
      const ours = await page.evaluate(() =>
        document.querySelectorAll('[data-sunglasses-at-night],#sunglasses-at-night-early,[data-san-inline],[data-san-fix]').length);
      assert.equal(ours, 0, 'engine left sheets or attributes on an already-dark page');
      assert.deepEqual(await page.evaluate(styleSignature), baseline.styles, 'computed colors changed on an already-dark page');
      await page.click('#go');
      assert.equal(await page.getAttribute('#go', 'data-clicks'), '1');
      assert.ok(clicks.clickable >= 1);
    }

    if (fx.name === 'shop') assert.ok(clicks.clickable >= 2, `only ${clicks.clickable} shop buttons clickable`);

    if (fx.name === 'hard-cases') {
      record(fx.name, 'media', { before: baseline.media, after: media });
      const ids = media.map((m) => m.id).sort();
      for (const id of ['f1-img', 'f2-img', 'f3-img', 'f3-faded', 'm-link', 'm-fig', 'm-faded', 'm-slow', 'm-revert', 'm-nofilter',
        'bg-url', 'bg-data', 'm-picture', 'm-canvas', 'm-embed', 'm-object', 'm-input-image']) {
        assert.ok(ids.includes(id), `media point ${id} not found (frames: ${page.frames().length})`);
      }
      // The fixture and the sampler agree on the page as authored...
      assert.deepEqual(mediaWrong(baseline.media), [], 'baseline media not as authored');
      // ...and darkening leaves every image as authored.
      assert.deepEqual(mediaWrong(media), [], 'media inverted, hidden or faded');

      // about:blank frames: the empty one isn't a white box, and the one the
      // page wrote into was darkened (audited above) and stays usable.
      const blank = await page.evaluate(() => {
        const r = document.getElementById('blank-empty').getBoundingClientRect();
        return [r.left + r.width / 2 + scrollX, r.top + r.height / 2 + scrollY];
      });
      const full = decodePng(await page.screenshot({ fullPage: true }));
      const blankPx = full.at(...blank);
      record(fx.name, 'blankFramePixel', blankPx);
      assert.ok(lum(blankPx) < 0.1, `empty about:blank frame paints ${blankPx}`);
      assert.ok(audits.some((a) => a.url === 'about:blank' && a.checked >= 2), 'filled about:blank frame text was not audited');

      // Real clicks, top page and inside frames.
      assert.ok(clicks.clickable >= 8, `only ${clicks.clickable} buttons clickable`);
      await page.click('#b-count');
      await page.click('#i-count');
      const f3 = page.frameLocator('#nested').frameLocator('iframe').frameLocator('iframe').locator('#f3-btn');
      await f3.click();
      const bf = page.frameLocator('#blank-filled').locator('#bf-btn');
      await bf.click();
      assert.equal(await page.getAttribute('#b-count', 'data-clicks'), '1');
      assert.equal(await page.getAttribute('#i-count', 'data-clicks'), '1');
      assert.equal(await f3.getAttribute('data-clicks'), '1');
      assert.equal(await bf.getAttribute('data-clicks'), '1');
      await page.click('#img-link');
      assert.equal(await page.evaluate(() => location.hash), '#frames');
    }
    await context.close();
  });
}

// Computed colors of every element, to compare a page with itself.
function styleSignature() {
  return [...document.querySelectorAll('body *')].map((el) => {
    const cs = getComputedStyle(el);
    return `${el.localName}|${cs.color}|${cs.backgroundColor}|${cs.borderTopColor}|${cs.colorScheme}`;
  });
}
