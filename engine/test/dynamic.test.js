import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rewriteValue, rewriteDeclarations, rewriteRules, baseCss, PROP_ROLES,
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
