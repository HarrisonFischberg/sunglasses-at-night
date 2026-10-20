#!/usr/bin/env node
// HTML report for a run: node qa/report.mjs <run> [--title "…"]
// Reads build/qa/runs/<run>/<platform>/results.json (written by analyze.mjs)
// for every platform folder, makes small thumbnails, and writes
// build/qa/runs/<run>/report/index.html. Third-party screenshots stay in
// build/ (git-ignored), as the repo already does for site captures.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const run = process.argv[2] ?? 'latest';
const RD = join(ROOT, 'build/qa/runs', run);
const OUT = join(RD, 'report');
const IMG = join(OUT, 'img');
mkdirSync(IMG, { recursive: true });
const CATS = ['flash', 'surface', 'media', 'text', 'function', 'restore'];
const EXTRA = ['flashDom', 'textDom', 'mediaDom', 'restoreDom', 'activation'];
const LABEL = { flash: 'Startup flash', surface: 'Surfaces', media: 'Media', text: 'Text & controls', function: 'Function', restore: 'Restore', flashDom: 'Flash (DOM)', textDom: 'Text (DOM)', mediaDom: 'Media (DOM)', restoreDom: 'Restore (DOM)', activation: 'Active' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function thumb(src, name) {
  const dst = join(IMG, name);
  if (!existsSync(dst) && existsSync(src)) { try { execFileSync('sips', ['-Z', '360', '-s', 'format', 'jpeg', '-s', 'formatOptions', '60', src, '--out', dst], { stdio: 'ignore' }); } catch {} }
  return existsSync(dst) ? `img/${name}` : null;
}
function spark(series) {
  if (!series?.length) return '';
  const t0 = series[0][0], t1 = series.at(-1)[0] || t0 + 1, W = 220, H = 36;
  const pts = (i) => series.map((r) => `${(((r[0] - t0) / (t1 - t0 || 1)) * W).toFixed(1)},${(H - r[i] * H).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="bright area over time"><polyline points="${pts(1)}" class="b"/><polyline points="${pts(2)}" class="u"/></svg>`;
}

const platforms = readdirSync(RD).filter((d) => existsSync(join(RD, d, 'results.json')));
const data = platforms.map((p) => ({ p, ...JSON.parse(readFileSync(join(RD, p, 'results.json'), 'utf8')) }));
let body = '';
const summary = [];
for (const d of data) {
  const sites = Object.values(d.sites);
  const tally = {};
  for (const s of sites) for (const k of [...CATS, ...EXTRA]) if (s.status[k]) { tally[k] ??= {}; tally[k][s.status[k].status] = (tally[k][s.status[k].status] ?? 0) + 1; }
  const live = sites.filter((s) => !s.id.startsWith('fx-'));
  const blocked = live.filter((s) => s.blocked);
  summary.push({ platform: d.p, attempted: live.length, completed: live.length - blocked.length, blocked: blocked.length, fixtures: sites.length - live.length, tally });
  body += `<section><h2>${esc(d.p)}</h2><p class="env">${esc(JSON.stringify(d.env ?? {}))}</p>`;
  body += `<table class="tally"><tr><th>Category</th>${['PASS', 'FAIL', 'NEEDS_REVIEW', 'BLOCKED', 'UNTESTED', 'NOT_APPLICABLE'].map((s) => `<th>${s}</th>`).join('')}</tr>`;
  for (const [k, v] of Object.entries(tally)) body += `<tr><td>${LABEL[k] ?? k}</td>${['PASS', 'FAIL', 'NEEDS_REVIEW', 'BLOCKED', 'UNTESTED', 'NOT_APPLICABLE'].map((s) => `<td class="${s}">${v[s] ?? ''}</td>`).join('')}</tr>`;
  body += `</table><p>Live domains attempted ${live.length}, completed ${live.length - blocked.length}, blocked ${blocked.length}; fixtures ${sites.length - live.length}.</p>`;
  body += '<div class="sites">';
  const order = { FAIL: 0, NEEDS_REVIEW: 1, BLOCKED: 2, UNTESTED: 3, PASS: 4, NOT_APPLICABLE: 5 };
  sites.sort((a, b) => Math.min(...Object.values(a.status).map((x) => order[x.status])) - Math.min(...Object.values(b.status).map((x) => order[x.status])) || a.id.localeCompare(b.id));
  for (const s of sites) {
    const dir = join(RD, d.p, s.batch, s.id);
    const imgs = ['fresh-off', 'startup-on', 'live-on', 'live-off', 'scrolled-off', 'scrolled-on', 'tapped-on'].map((n) => [n, thumb(join(dir, `${n}.png`), `${d.p}-${s.id.replace(/\W/g, '_')}-${n}.jpg`)]).filter(([, t]) => t);
    const rows = [...CATS, ...EXTRA].filter((k) => s.status[k]).map((k) => `<tr><td>${LABEL[k]}</td><td class="${s.status[k].status}">${s.status[k].status}${s.status[k].reviewed ? ' ✓' : ''}</td><td>${esc(s.status[k].reason)}</td></tr>`).join('');
    const f = s.flash;
    body += `<article id="${esc(d.p)}-${esc(s.id)}"><h3>${esc(s.id)} <small>${esc(s.manifest?.category ?? '')} · ${esc(s.evidence)}${s.activation?.proven ? ' · extension proven active' : ''}</small></h3>
<p class="url"><a href="${esc(s.url)}">${esc(s.url)}</a> · batch <a href="${esc(relative(OUT, join(RD, d.p, s.batch)))}">${esc(s.batch)}</a></p>
<table class="st">${rows}</table>
${f ? `<p class="flash">Startup timeline (white = bright area, red = bright that ends dark): ${spark((readJSONSafe(join(RD, d.p, s.batch, 'flash.json')) ?? {})[s.id]?.series)} first dark ${f.firstDarkAt ?? '–'} s, stable ${f.stableAt} s, ${f.frames} frames, max gap ${Math.round((f.maxGap ?? 0) * 1000)} ms${existsSync(join(dir, 'startup.mov')) ? ` · <a href="${esc(relative(OUT, join(dir, 'startup.mov')))}">recording</a>` : ''}</p>` : ''}
<div class="shots">${imgs.map(([n, t]) => `<figure><a href="${esc(relative(OUT, join(dir, n + '.png')))}"><img src="${t}" alt="${esc(s.id)} ${n}" loading="lazy"></a><figcaption>${n}</figcaption></figure>`).join('')}</div></article>`;
  }
  body += '</div></section>';
}
function readJSONSafe(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Safari QA Report</title>
<style>
:root{--bg:#fbfbfa;--fg:#1d1d1f;--mut:#6b6b70;--line:#e3e3e0;--pass:#1e7f45;--fail:#b3261e;--rev:#8a5a00;--blk:#5b4fc4}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#141416;--fg:#ececee;--mut:#9a9aa1;--line:#2c2c30;--pass:#5fd38d;--fail:#ff8a80;--rev:#ffc95c;--blk:#b3a9ff}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 -apple-system,system-ui,sans-serif;padding:16px;max-width:1400px}
h1{font-size:22px}h2{margin-top:32px;border-bottom:1px solid var(--line)}h3{margin:0 0 4px;font-size:16px}small,.env,.url{color:var(--mut)}
.env{font:11px ui-monospace,monospace;word-break:break-all}table{border-collapse:collapse}td,th{border:1px solid var(--line);padding:3px 7px;text-align:left;vertical-align:top}
.PASS{color:var(--pass);font-weight:600}.FAIL{color:var(--fail);font-weight:700}.NEEDS_REVIEW{color:var(--rev);font-weight:600}.BLOCKED{color:var(--blk)}.UNTESTED,.NOT_APPLICABLE{color:var(--mut)}
article{border:1px solid var(--line);border-radius:10px;padding:12px;margin:12px 0}.shots{display:flex;gap:8px;overflow-x:auto}figure{margin:0}figure img{height:260px;border:1px solid var(--line);border-radius:6px}
figcaption{font-size:11px;color:var(--mut);text-align:center}.spark{vertical-align:middle;background:#000;border-radius:4px}.spark .b{fill:none;stroke:#ddd;stroke-width:1.5}.spark .u{fill:none;stroke:#ff4d4d;stroke-width:2}
.st td:last-child{max-width:760px}
</style></head><body>
<h1>Sunglasses for Safari: Safari QA report (${esc(run)})</h1>
<p>Generated ${new Date().toISOString()} by <code>node qa/report.mjs ${esc(run)}</code>. Statuses are automated unless marked ✓ (visually reviewed). Thresholds are listed in results.json and qa/lib/judge.js. Supplementary engines are not included here.</p>
<pre>${esc(JSON.stringify(summary, null, 1))}</pre>
${body}</body></html>`;
writeFileSync(join(OUT, 'index.html'), html);
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
console.log('report →', join(OUT, 'index.html'));
