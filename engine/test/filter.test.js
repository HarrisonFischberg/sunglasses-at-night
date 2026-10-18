import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageFilter, filterCss, dynamicImageCss, startFilter, FILTER_ROLE, DIM } from '../src/filter.js';
import { withoutImages, rewriteDeclarations, MARK } from '../src/dynamic.js';
import { withEngine, popupView } from '../src/ui-core.js';
import { defaultSettings } from '../src/settings.js';
import { relativeLuminance } from '../src/color.js';

// ---- a model of the CSS filter primitives (Filter Effects 1), to check that
// page filter ∘ counter-filter is the identity and a second counter is not.
const clamp = (v) => Math.min(1, Math.max(0, v));
const invert = ([r, g, b]) => [1 - r, 1 - g, 1 - b];
function hueRotate180([r, g, b]) {
  const m = [
    [-0.574, 1.43, 0.144],
    [0.426, 0.43, 0.144],
    [0.426, 1.43, -0.856],
  ];
  return m.map((row) => clamp(row[0] * r + row[1] * g + row[2] * b));
}
const counter = (c) => hueRotate180(invert(c)); // invert(100%) hue-rotate(180deg)
const page = counter; // same primitives at identity look
const lum = ([r, g, b]) => relativeLuminance({ r, g, b, alpha: 1 });
const near = (a, b, tol = 2 / 255) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

const LIGHT_PHOTO = [230 / 255, 200 / 255, 150 / 255];
const DARK_PHOTO = [40 / 255, 40 / 255, 60 / 255];

test('filter model: media under the page filter alone would show inverted', () => {
  assert.ok(lum(LIGHT_PHOTO) > 0.5 && lum(page(LIGHT_PHOTO)) < 0.1);
  assert.ok(lum(DARK_PHOTO) < 0.05 && lum(page(DARK_PHOTO)) > 0.6);
});

test('filter model: one counter-filter restores media; a doubled counter inverts it again', () => {
  for (const photo of [LIGHT_PHOTO, DARK_PHOTO]) {
    assert.ok(near(page(counter(photo)), photo), `restored ${photo}`);
    assert.ok(!near(page(counter(counter(photo))), photo, 0.2), 'double counter is visibly wrong');
  }
});

test('pageFilter: identity look is invert + hue-rotate only; sliders append in order', () => {
  assert.equal(pageFilter(), 'invert(100%) hue-rotate(180deg)');
  assert.equal(pageFilter({ brightness: 100, contrast: 100, sepia: 0, grayscale: 0 }), 'invert(100%) hue-rotate(180deg)');
  assert.equal(
    pageFilter({ brightness: 90, contrast: 110, sepia: 40, grayscale: 100 }),
    'invert(100%) hue-rotate(180deg) brightness(90%) contrast(110%) sepia(40%) grayscale(100%)',
  );
  assert.equal(pageFilter({ brightness: 9999 }), 'invert(100%) hue-rotate(180deg) brightness(150%)', 'clamped');
});

test('filterCss: root filtered with !important; canvas fallback at zero specificity', () => {
  const css = filterCss();
  assert.match(css, /:root\{filter:invert\(100%\) hue-rotate\(180deg\)!important;color-scheme:light!important\}/);
  assert.match(css, /:where\(:root\)\{background-color:#fff\}/);
  assert.ok(!/pointer-events|position|display|opacity|z-index/.test(css), 'colors and filters only');
});

test('filterCss: counter-filter only on outermost media (no double inversion)', () => {
  const css = filterCss();
  const m = /(:is\([^{]*\):not\(:is\([^)]*\) \*\))\{filter:([^}]*)\}/.exec(css);
  assert.ok(m, css);
  const [, selector, value] = m;
  assert.equal(value, 'invert(100%) hue-rotate(180deg)!important');
  for (const t of ['img', 'video', 'canvas', 'embed', 'object', 'iframe[src]']) assert.ok(selector.includes(t), t);
  assert.ok(!/\bpicture\b/.test(selector), '<picture> itself is not countered, only its <img>');
  assert.ok(selector.includes(':not(:is(video,canvas,embed,object,iframe) *)'), 'media inside countered media skipped');
  assert.ok(/:not\(\[src\^="about:" i\]\)/.test(selector) && selector.includes(':not([srcdoc])'), 'frames without our script stay under the page filter');
  assert.ok(!/\bsvg\b/.test(selector), 'leave: inline svg follows the page');
});

test('filterCss: image modes', () => {
  assert.equal(filterCss(undefined, { images: 'no-invert' }).includes(',svg):not(:is(video,canvas,embed,object,iframe,svg) *)'), true);
  assert.ok(filterCss(undefined, { images: 'dim' }).includes(`{filter:${DIM} invert(100%) hue-rotate(180deg)!important}`));
  // brightness(80%) before the counter: the page filter then cancels the counter exactly.
  const dim = (c) => c.map((v) => v * 0.8);
  assert.ok(near(page(counter(dim(LIGHT_PHOTO))), dim(LIGHT_PHOTO)), 'dim-then-counter shows dimmed media');
  assert.ok(!near(page(dim(counter(LIGHT_PHOTO))), dim(LIGHT_PHOTO), 0.05), 'counter-then-dim would not');
  assert.ok(!filterCss(undefined, { images: 'leave' }).includes(DIM));
});

test('filterCss: hide background images only when asked', () => {
  assert.ok(!filterCss().includes('background-image'));
  assert.ok(filterCss(undefined, { hideBackgroundImages: true }).includes('*:not(svg *),*::before,*::after{background-image:none!important}'));
});

test('dynamicImageCss: only dim adds CSS, and it beats inline filter:none', () => {
  assert.equal(dynamicImageCss('leave'), '');
  assert.equal(dynamicImageCss('no-invert'), '');
  assert.equal(dynamicImageCss('dim'), `img,video,canvas,embed,object{filter:${DIM}!important}`);
});

test('withoutImages: drops url/image-set layers, keeps gradients', () => {
  assert.equal(withoutImages('url(a.png)'), 'none');
  assert.equal(withoutImages('url("a.png"), linear-gradient(red, blue)'), 'linear-gradient(red, blue)');
  assert.equal(withoutImages('image-set("a.png" 1x, "b.png" 2x)'), 'none');
  assert.equal(withoutImages('-webkit-image-set(url(a.png) 1x)'), 'none');
  assert.equal(withoutImages('linear-gradient(white, black)'), 'linear-gradient(white, black)');
  assert.equal(withoutImages('none'), 'none');
  assert.equal(withoutImages('url(data:image/svg+xml;utf8,<svg/>)'), 'none');
});

function decl(entries) {
  const props = Object.keys(entries);
  return {
    length: props.length,
    item: (i) => props[i],
    getPropertyValue: (p) => (entries[p] ?? [''])[0],
    getPropertyPriority: (p) => (entries[p]?.[1] ? 'important' : ''),
  };
}

test('rewriteDeclarations: hideImages replaces image backgrounds, keeps the rest', () => {
  const style = decl({ 'background-image': ['url(hero.jpg)'], color: ['black'] });
  assert.ok(!rewriteDeclarations(style, undefined).some((d) => d.startsWith('background-image')), 'shown by default');
  const hidden = rewriteDeclarations(style, undefined, { hideImages: true });
  assert.ok(hidden.includes('background-image:none'), hidden.join(';'));
  const imp = rewriteDeclarations(decl({ 'background-image': ['url(a.png)', true] }), undefined, { hideImages: true });
  assert.deepEqual(imp, ['background-image:none !important']);
  const mixed = rewriteDeclarations(decl({ 'background-image': ['url(a.png), linear-gradient(#fff, #eee)'] }), undefined, { hideImages: true });
  assert.ok(/^background-image:linear-gradient\(rgb/.test(mixed[0]), mixed[0]);
});

// ---- startFilter on a fake document
function fakeDocument() {
  const root = {
    children: [],
    get lastChild() { return this.children.at(-1) ?? null; },
    appendChild(el) {
      this.children = this.children.filter((c) => c !== el);
      this.children.push(el);
      el.parent = this;
      return el;
    },
  };
  return {
    documentElement: root,
    createElementNS: (ns, tag) => ({
      ns, tag, attrs: {}, textContent: '',
      setAttribute(k, v) { this.attrs[k] = v; },
      remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; },
    }),
  };
}

test('startFilter: one marked <style> as the root\'s last child; stop() removes it', () => {
  const doc = fakeDocument();
  const ctl = startFilter({ document: doc, look: undefined, images: 'dim', hideBackgroundImages: true });
  const [el] = doc.documentElement.children;
  assert.equal(doc.documentElement.children.length, 1);
  assert.equal(el.tag, 'style');
  assert.equal(el.ns, 'http://www.w3.org/1999/xhtml');
  assert.equal(el.attrs[MARK], FILTER_ROLE);
  assert.equal(el.textContent, filterCss(undefined, { images: 'dim', hideBackgroundImages: true }));
  doc.documentElement.appendChild({ tag: 'body' });
  ctl.refresh();
  assert.equal(doc.documentElement.lastChild, el, 'refresh keeps it last');
  ctl.stop();
  assert.deepEqual(doc.documentElement.children.map((c) => c.tag), ['body']);
});

test('withEngine: per-site engine set, and default removes it', () => {
  assert.deepEqual(withEngine({ rule: 'default' }, 'filter'), { rule: 'default', engine: 'filter' });
  assert.equal(withEngine({ rule: 'default', engine: 'filter' }, 'default'), null);
  assert.deepEqual(withEngine({ rule: 'always', engine: 'filter' }, 'default'), { rule: 'always' });
  assert.deepEqual(withEngine({ rule: 'never' }, 'dynamic'), { rule: 'never', engine: 'dynamic' });
});

test('popupView: reports the site engine choice', () => {
  const s = defaultSettings();
  assert.equal(popupView({ settings: s, url: 'https://a.example/' }).engine, 'default');
  s.sites['a.example'] = { rule: 'default', engine: 'filter' };
  assert.equal(popupView({ settings: s, url: 'https://a.example/' }).engine, 'filter');
});
