import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rewriteValue, rewriteDeclarations, rewriteRules, baseCss, pendingCss, PROP_ROLES,
} from '../src/dynamic.js';
import { parseColor, relativeLuminance, contrastRatio } from '../src/color.js';
import { transformColor, quantize } from '../src/transform.js';
import { formatRgb } from '../src/color.js';

const mapped = (c, role) => formatRgb(quantize(transformColor(c, role)));

// Minimal CSSStyleDeclaration stand-in.
function decl(entries) {
  const props = Object.keys(entries);
  return {
    length: props.length,
    item: (i) => props[i],
    getPropertyValue: (p) => (entries[p] ?? [''])[0],
    getPropertyPriority: (p) => (entries[p]?.[1] ? 'important' : ''),
  };
}

test('rewriteValue: plain colors map by role', () => {
  assert.equal(rewriteValue('#fff', 'bg'), mapped('#fff', 'bg'));
  assert.equal(rewriteValue('black', 'fg'), mapped('black', 'fg'));
  assert.equal(rewriteValue('rgb(200 200 200)', 'border'), mapped('rgb(200 200 200)', 'border'));
  assert.equal(rewriteValue('oklch(0.98 0.01 250)', 'bg'), mapped('oklch(0.98 0.01 250)', 'bg'));
  assert.ok(relativeLuminance(parseColor(rewriteValue('white', 'bg'))) < 0.1);
});

test('rewriteValue: keywords, transparent and unknown values are left alone', () => {
  for (const v of ['inherit', 'currentColor', 'transparent', 'none', 'initial', 'unset', 'revert', '', 'auto']) {
    assert.equal(rewriteValue(v, 'fg'), null, v);
  }
  assert.equal(rewriteValue('url(white.png)', 'bg'), null);
  assert.equal(rewriteValue('rgb(0 0 0 / 0)', 'bg'), null);
  assert.equal(rewriteValue(42, 'bg'), null);
});

test('rewriteValue: gradients rewrite every color stop and nothing else', () => {
  const out = rewriteValue('linear-gradient(to right, #ffffff 0%, rgba(240,240,240,.5) 50%, white 100%)', 'bg');
  assert.ok(out.startsWith('linear-gradient(to right, '), out);
  assert.ok(out.includes(` ${mapped('#ffffff', 'bg')} 0%`), out);
  assert.ok(out.includes(`${mapped('white', 'bg')} 100%`), out);
  assert.ok(!/#ffffff|white/.test(out), out);
});

test('rewriteValue: url() and strings inside a value are untouched', () => {
  const out = rewriteValue('url("red.png"), linear-gradient(red, blue)', 'bg');
  assert.ok(out.startsWith('url("red.png"), linear-gradient('), out);
  assert.ok(!out.includes('red,'), out);
  assert.equal(rewriteValue('url(#white)', 'bg'), null);
});

test('rewriteValue: var() reads the role variant and falls back to the original', () => {
  assert.equal(rewriteValue('var(--bg)', 'bg'), 'var(--san-bg--bg, var(--bg))');
  const withFallback = rewriteValue('var(--text, #000)', 'fg');
  assert.equal(withFallback, `var(--san-fg--text, var(--text, ${mapped('#000', 'fg')}))`);
  assert.equal(rewriteValue('var(--san-bg--x)', 'bg'), null, 'our own variants are not wrapped again');
});

test('rewriteValue: color-mix with var() operands rewrites its parts', () => {
  const out = rewriteValue('color-mix(in srgb, var(--a) 40%, white)', 'bg');
  assert.ok(out.includes('var(--san-bg--a, var(--a))'), out);
  assert.ok(out.includes(mapped('white', 'bg')), out);
});

test('rewriteValue: identifiers that are not colors and dimensions survive', () => {
  assert.equal(rewriteValue('1px solid', 'border'), null);
  assert.equal(rewriteValue('-webkit-linear-gradient(top, red, blue)', 'bg').startsWith('-webkit-linear-gradient(top, '), true);
});

test('rewriteDeclarations: color longhands, priorities and verbatim keywords', () => {
  const out = rewriteDeclarations(decl({
    color: ['#111'],
    'background-color': ['#fff', true],
    'border-top-color': ['inherit'],
    width: ['10px'],
    'pointer-events': ['none'],
    'background-image': ['url(a.png)'],
  }));
  assert.deepEqual(out, [
    `color:${mapped('#111', 'fg')}`,
    `background-color:${mapped('#fff', 'bg')} !important`,
    'border-top-color:inherit',
  ]);
});

test('rewriteDeclarations: never emits layout or hit-testing properties', () => {
  const all = Object.fromEntries([...Object.keys(PROP_ROLES), 'pointer-events', 'position', 'z-index', 'display', 'opacity']
    .map((p) => [p, ['white']]));
  for (const line of rewriteDeclarations(decl(all))) {
    const prop = line.slice(0, line.indexOf(':'));
    assert.ok(Object.hasOwn(PROP_ROLES, prop), `unexpected property ${prop}`);
  }
});

test('rewriteDeclarations: custom properties get one variant per role', () => {
  const out = rewriteDeclarations(decl({ '--brand': ['#ffffff'], '--gap': ['8px'] }));
  assert.deepEqual(out, [
    `--san-bg--brand:${mapped('#ffffff', 'bg')}`,
    `--san-fg--brand:${mapped('#ffffff', 'fg')}`,
    `--san-border--brand:${mapped('#ffffff', 'border')}`,
  ]);
  const chained = rewriteDeclarations(decl({ '--surface': ['var(--brand)'] }));
  assert.ok(chained.includes('--san-bg--surface:var(--san-bg--brand, var(--brand))'), chained.join('\n'));
});

test('rewriteDeclarations: shorthand pending var() substitution is rewritten whole', () => {
  const style = decl({ 'background-color': [''] });
  const base = style.getPropertyValue;
  style.getPropertyValue = (p) => (p === 'background' ? 'var(--card) no-repeat' : base(p));
  const out = rewriteDeclarations(style);
  assert.deepEqual(out, ['background:var(--san-bg--card, var(--card)) no-repeat']);
});

test('rewriteDeclarations: color-scheme light becomes dark; inline forces !important', () => {
  assert.deepEqual(rewriteDeclarations(decl({ 'color-scheme': ['light'] })), ['color-scheme:dark']);
  assert.deepEqual(rewriteDeclarations(decl({ 'color-scheme': ['light dark'] })), []);
  assert.deepEqual(rewriteDeclarations(decl({ color: ['red'] }), undefined, { important: true }), [`color:${mapped('red', 'fg')} !important`]);
});

test('rewriteRules: style, grouping, nested, import, keyframes and page rules', () => {
  const rules = [
    { type: 1, selectorText: 'body', style: decl({ background: [''], 'background-color': ['#fff'] }) },
    { type: 1, selectorText: '.n', style: decl({ width: ['1px'] }) },
    { type: 4, cssText: '@media (min-width: 10px) { .m { color: red; } }', cssRules: [
      { type: 1, selectorText: '.m', style: decl({ color: ['red'] }) },
    ] },
    { type: 1, selectorText: '.card', style: decl({ color: ['#222'] }), cssRules: [
      { type: 1, selectorText: '&:hover', style: decl({ 'background-color': ['#eee'] }) },
    ] },
    { type: 3, href: 'x.css', media: { mediaText: 'print' } },
    { type: 7, cssText: '@keyframes k { from { color: red } }', cssRules: [{ type: 8, keyText: 'from', style: decl({ color: ['red'] }) }] },
    { type: 6, selectorText: '', style: decl({ color: ['red'] }) },
  ];
  const css = rewriteRules(rules, undefined, () => '.i{color:x}');
  assert.equal(css,
    `body{background-color:${mapped('#fff', 'bg')}}` +
    `@media (min-width: 10px){.m{color:${mapped('red', 'fg')}}}` +
    `.card{color:${mapped('#222', 'fg')};&:hover{background-color:${mapped('#eee', 'bg')}}}` +
    '@media print{.i{color:x}}');
});

test('rewriteRules: @property initial colors get root variants (QA: MyChart login text black on dark)', () => {
  const rules = [
    { type: 0, name: '--wpcolor_black', syntax: '<color>', inherits: true, initialValue: '#000000' },
    { type: 0, name: '--gap', syntax: '<length>', inherits: false, initialValue: '8px' },
    { type: 0, name: '--none', syntax: '*', inherits: true, initialValue: null },
    { type: 1, selectorText: 'input', style: decl({ color: ['var(--wpcolor_black)'] }) },
  ];
  const css = rewriteRules(rules, undefined, () => '');
  assert.equal(css,
    `:where(:root){--san-bg--wpcolor_black:${mapped('#000000', 'bg')};--san-fg--wpcolor_black:${mapped('#000000', 'fg')};--san-border--wpcolor_black:${mapped('#000000', 'border')}}` +
    'input{color:var(--san-fg--wpcolor_black, var(--wpcolor_black))}');
});

test('rewriteRules: isDead leaves out style rules that cannot match, keeps nested parents', () => {
  const dead = new Set(['.gone', '.parent']);
  const rules = [
    { type: 1, selectorText: '.gone', style: decl({ color: ['#222'] }) },
    { type: 1, selectorText: '.here', style: decl({ color: ['#222'] }) },
    { type: 4, cssText: '@media (min-width: 10px) { .gone { color: red; } }', cssRules: [
      { type: 1, selectorText: '.gone', style: decl({ color: ['red'] }) },
    ] },
    { type: 1, selectorText: '.parent', style: decl({ color: ['#222'] }), cssRules: [
      { type: 1, selectorText: '&:hover', style: decl({ 'background-color': ['#eee'] }) },
    ] },
  ];
  const css = rewriteRules(rules, undefined, () => '', { isDead: (s) => dead.has(s) });
  assert.equal(css,
    `.here{color:${mapped('#222', 'fg')}}` +
    `.parent{color:${mapped('#222', 'fg')};&:hover{background-color:${mapped('#eee', 'bg')}}}`);
  assert.equal(rewriteRules(rules.slice(0, 2), undefined, () => '').split('{').length, 3, 'without isDead nothing is left out');
});

test('baseCss: dark canvas, readable default text and link colors, zero specificity', () => {
  const css = baseCss();
  assert.ok(css.startsWith(':where(:root){color-scheme:dark;'));
  const bg = /background-color:(rgb\([^)]*\))/.exec(css)[1];
  assert.ok(relativeLuminance(parseColor(bg)) < 0.1);
  for (const m of css.matchAll(/[^-]color:(rgb\([^)]*\))/g)) {
    assert.ok(contrastRatio(m[1], bg) >= 4.5, `${m[1]} on ${bg}`);
  }
  assert.ok(!/pointer-events|position|z-index|display/.test(css));
});

test('rewriteDeclarations: a light tint that blends in the same rule turns transparent (QA: ::after tint over product photos)', () => {
  // .tile .tint::after { background:#f7f7f7; mix-blend-mode:multiply }: darkened and
  // made normal, the opaque tint hid the photo under it (black tile).
  const out = rewriteDeclarations(decl({ 'background-color': ['#f7f7f7'], 'mix-blend-mode': ['multiply'] }));
  assert.ok(out.includes('background-color:transparent'), out.join(';'));
  assert.ok(out.includes('mix-blend-mode:normal'));
  assert.ok(rewriteDeclarations(decl({ 'background-color': ['rgba(0, 0, 0, 0.03)'], 'mix-blend-mode': ['darken'] })).includes('background-color:transparent'));
  // A dark or saturated blending fill is a real color, not a tint: rewritten as before.
  for (const bg of ['#202020', '#c0392b']) {
    const o = rewriteDeclarations(decl({ 'background-color': [bg], 'mix-blend-mode': ['multiply'] }));
    assert.ok(!o.includes('background-color:transparent'), `${bg}: ${o.join(';')}`);
  }
  // No blend: a light background is darkened as usual.
  assert.ok(!rewriteDeclarations(decl({ 'background-color': ['#f7f7f7'] })).includes('background-color:transparent'));
  // A blending picture (url layer) is media-like: left to the image rules.
  assert.ok(!rewriteDeclarations(decl({ 'background-color': ['#fff'], 'background-image': ['url(x.png)'], 'mix-blend-mode': ['multiply'] })).includes('background-color:transparent'));
});

test('rewriteDeclarations: multiply / darken / color-burn / luminosity blends become normal (T031)', () => {
  for (const mode of ['multiply', 'darken', 'color-burn', 'luminosity']) {
    assert.deepEqual(rewriteDeclarations(decl({ 'mix-blend-mode': [mode] })), ['mix-blend-mode:normal', '--san-blend:1'], mode);
  }
  assert.deepEqual(rewriteDeclarations(decl({ 'mix-blend-mode': ['multiply', true] })), ['mix-blend-mode:normal !important', '--san-blend:1 !important']);
  assert.deepEqual(rewriteDeclarations(decl({ 'mix-blend-mode': ['multiply'] }), undefined, { important: true }), ['mix-blend-mode:normal !important', '--san-blend:1 !important']);
  for (const mode of ['normal', 'screen', 'overlay', 'lighten', '']) {
    assert.deepEqual(rewriteDeclarations(decl({ 'mix-blend-mode': [mode] })), [], mode);
  }
});

test('rewriteDeclarations: channel-list custom properties (Dawn/Shopify) get per-role variants in the same format', () => {
  const out = rewriteDeclarations(decl({ '--color-background': ['255,255,255'], '--color-foreground': ['18, 18, 18'] }), undefined);
  const bg = out.find((d) => d.startsWith('--san-bg--color-background:'));
  const fg = out.find((d) => d.startsWith('--san-fg--color-foreground:'));
  assert.match(bg, /^--san-bg--color-background:\d+,\d+,\d+$/);
  assert.match(fg, /^--san-fg--color-foreground:\d+,\d+,\d+$/);
  const lum = (s) => {
    const [r, g, b] = s.split(':')[1].split(',').map(Number);
    return relativeLuminance({ r: r / 255, g: g / 255, b: b / 255 });
  };
  assert.ok(lum(bg) < 0.1, 'white background becomes dark');
  assert.ok(lum(fg) > 0.5, 'near-black text becomes light');
  const space = rewriteDeclarations(decl({ '--c': ['255 255 255 / 0.5'] }), undefined);
  assert.match(space.find((d) => d.startsWith('--san-bg--c:')), /^--san-bg--c:\d+ \d+ \d+ \/ 0\.5$/);
  assert.deepEqual(rewriteDeclarations(decl({ '--cols': ['1, 2, 3, 4'] }), undefined), []);
  assert.deepEqual(rewriteDeclarations(decl({ '--big': ['300,300,300'] }), undefined), []);
});

test('rewriteValue: rgb(var(--x)) reads the variant of the using property role', () => {
  assert.match(rewriteValue('rgb(var(--color-background))', 'bg'), /var\(--san-bg--color-background/);
  assert.match(rewriteValue('rgba(var(--color-foreground), .75)', 'fg'), /var\(--san-fg--color-foreground/);
});

test('pendingCss: transparent backgrounds and base text color for the tagged subtree, media untouched (T031)', () => {
  const css = pendingCss();
  assert.match(css, /^\[data-sunglasses-pending\],\[data-sunglasses-pending\] \*:not\(img,picture,video,canvas,svg,iframe,embed,object\)\{background-color:transparent!important;color:rgb\(/);
  assert.match(css, /\[data-sunglasses-pending\] img,img\[data-sunglasses-pending\]\{background-color:transparent!important\}/);
});
