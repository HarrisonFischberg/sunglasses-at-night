#!/usr/bin/env node
// Analyze a platform run folder: node qa/analyze.mjs build/qa/runs/<run>/<platform>
// Reads every batch's site captures, measures them with build/qa-image, writes
// <platform>/results.json (per site, per category status + metrics). Cached per
// site (analysis.json) unless --force.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as J from './lib/judge.js';
import { loadManifest } from './lib/manifest.js';
import { ensureTools } from './lib/tools.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const dir = resolve(process.argv[2]);
const force = process.argv.includes('--force');
const QI = ensureTools();
const qi = (...a) => JSON.parse(execFileSync(QI, a, { encoding: 'utf8', maxBuffer: 1 << 28 }));
const readJ = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const platform = dir.split('/').pop();
const byId = new Map([...loadManifest().sites, ...loadManifest('fixtures').sites].map((s) => [s.id, s]));

// Page viewport in screenshot pixels, excluding the status bar and Safari's
// bottom bar. iOS: from the capture's own web view frame.
function pageRect(meta) {
  const sc = meta.scale ?? 1;
  const [x, y, w, h] = meta.viewport?.length === 4 ? meta.viewport : [0, 0, 0, 0];
  if (platform.startsWith('ios')) {
    const top = Math.max(y, 62), bottom = Math.min(y + h, h > 800 ? y + h - 98 : y + h);
    return [x * sc, top * sc, w * sc, (bottom - top) * sc];
  }
  return meta.pageRect ?? [x * sc, y * sc, w * sc, h * sc];
}

function regionsFile(siteDir, meta, name) {
  const sc = meta.scale ?? 1;
  const r = { page: pageRect(meta), images: meta.images.map((a) => a.map((v) => v * sc)), texts: meta.texts.map((t) => t.r.map((v) => v * sc)) };
  const p = join(siteDir, `${name}.regions.json`);
  writeFileSync(p, JSON.stringify(r));
  return p;
}

function batches() {
  return readdirSync(dir).filter((d) => d.startsWith('batch-')).map((d) => join(dir, d)).filter((d) => statSync(d).isDirectory()).sort();
}

const results = {};
for (const b of batches()) {
  const events = existsSync(join(b, 'events.jsonl')) ? readFileSync(join(b, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const rec = readJ(join(b, 'rec-start.json'));
  // Activation proof from the fixture beacon for this batch.
  const beacon = existsSync(join(dir, 'beacons', `${b.split('/').pop()}.jsonl`))
    ? readFileSync(join(dir, 'beacons', `${b.split('/').pop()}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  const onB = beacon.find((x) => x.page === '/activation.html' && x.samples?.some((s) => s.ready));
  const activation = onB ? { proven: true, ua: onB.ua, last: onB.samples.at(-1) } : { proven: false };
  // Flash segments: from the launcher's beaconed navigation time (padded
  // 0.8 s earlier: the launcher page itself is already dark) to readiness.
  const segs = [];
  const redirects = new Map(beacon.filter((x) => x.page === '/go.html' && x.redirectWall).map((x) => [x.id, x.redirectWall]));
  if (rec && existsSync(join(b, 'screen.mp4'))) {
    for (const e of events.filter((x) => x.event === 'nav-start' && x.tag.endsWith('/startup-on'))) {
      const id = e.tag.split('/')[0];
      const ready = events.find((x) => x.event === 'ready' && x.tag === e.tag);
      const from = redirects.get(id);
      if (from) segs.push({ id, start: Math.max(0, from - rec.wall - 0.8), end: (ready?.wall ?? from + 20) - rec.wall });
      else segs.push({ id, skipLeadingSheet: e.via === 'typed', start: Math.max(0, e.wall - rec.wall - 0.15), end: (ready?.wall ?? e.wall + 20) - rec.wall });
    }
  }
  // macOS: one recording per site (startup.mov) with its own wall clock.
  const macFlash = {};
  if (platform.startsWith('macos')) {
    for (const id of readdirSync(b).filter((d) => existsSync(join(b, d, 'startup.mov')))) {
      const site = readJ(join(b, id, 'site.json')); const rc = site?.recording;
      if (!rc?.startWall) continue;
      const cache = join(b, id, 'flash.json');
      if (!force && existsSync(cache)) { macFlash[id] = readJ(cache); continue; }
      const sp = join(b, id, 'segments.json');
      writeFileSync(sp, JSON.stringify({ segments: [{ id, start: Math.max(0, rc.navWall - rc.startWall + 0.05), end: rc.readyWall - rc.startWall + 0.5 }], pageNorm: [0, 0.1, 1, 0.9] }));
      try { macFlash[id] = qi('flash', join(b, id, 'startup.mov'), sp).segments[0]; writeFileSync(cache, JSON.stringify(macFlash[id])); } catch (e) { macFlash[id] = { error: String(e.message).slice(0, 200) }; }
    }
  }
  let flash = {};
  const flashCache = join(b, 'flash.json');
  if (segs.length) {
    if (!force && existsSync(flashCache)) flash = readJ(flashCache);
    else {
      const sp = join(b, 'segments.json');
      writeFileSync(sp, JSON.stringify({ segments: segs, pageNorm: platform.startsWith('ios') ? [0, 0.075, 1, 0.80] : [0, 0, 1, 1] }));
      flash = Object.fromEntries(qi('flash', join(b, 'screen.mp4'), sp).segments.map((s) => [s.id, s]));
      writeFileSync(flashCache, JSON.stringify(flash));
    }
  }
  for (const id of readdirSync(b).filter((d) => existsSync(join(b, d, 'site.json')))) {
    const sd = join(b, id);
    const cache = join(sd, 'analysis.json');
    let a = !force && existsSync(cache) ? readJ(cache) : null;
    if (!a) {
      const m = (n) => normalize(readJ(join(sd, `${n}.json`)));
      const caps = Object.fromEntries(['startup-on', 'live-off', 'fresh-off', 'live-on', 'scrolled-on', 'scrolled-off'].map((n) => [n, m(n)]).filter(([, v]) => v));
      const pair = (offN, onN) => {
        if (!caps[offN] || !caps[onN]) return null;
        const r = qi('pair', join(sd, `${offN}.png`), join(sd, `${onN}.png`), regionsFile(sd, caps[onN], `${offN}-${onN}`));
        return { ...r, name: `${offN}→${onN}` };
      };
      // Paired captures only compare like with like if the page itself didn't
      // change state in between (an app-install sheet, a newsletter modal, a
      // carousel slide). Text-label overlap tells.
      const overlap = (x, y) => {
        const A = new Set((caps[x]?.texts ?? []).map((t) => t.s)), B = new Set((caps[y]?.texts ?? []).map((t) => t.s));
        if (!A.size || !B.size) return null;
        let n = 0; for (const v of A) if (B.has(v)) n++;
        return n / Math.max(A.size, B.size);
      };
      const stable = { main: overlap('fresh-off', 'live-on'), startup: overlap('fresh-off', 'startup-on'), scrolled: overlap('scrolled-off', 'scrolled-on'), restore: overlap('fresh-off', 'live-off') };
      const main = pair('fresh-off', 'live-on');
      const startup = pair('fresh-off', 'startup-on');
      const scrolled = pair('scrolled-off', 'scrolled-on');
      const restorePair = pair('fresh-off', 'live-off'); // layout check for the restoration pair
      const restore = caps['fresh-off'] && caps['live-off'] ? qi('restore', join(sd, 'fresh-off.png'), join(sd, 'live-off.png'), regionsFile(sd, caps['fresh-off'], 'restore')) : null;
      const site = readJ(join(sd, 'site.json'));
      a = { main, startup, scrolled, restore, restoreEdge: restorePair?.edgeMatchRev ?? null, site, stable, caps: Object.fromEntries(Object.entries(caps).map(([k, v]) => [k, { counts: v.counts, images: v.images.length, texts: v.texts.length }])),
        texts: [...(caps['fresh-off']?.texts ?? []), ...(caps['startup-on']?.texts ?? [])].map((t) => t.s) };
      writeFileSync(cache, JSON.stringify(a));
    }
    const site = a.site;
    const blocked = J.blockedReason(a.texts);
    const status = {};
    if (blocked) {
      for (const k of ['flash', 'surface', 'media', 'text', 'function', 'restore']) status[k] = { status: 'BLOCKED', reason: blocked };
    } else {
      status.flash = J.judgeFlash(flash[id] ?? macFlash[id]);
      if (site.mode === 'startup') for (const k of ['surface', 'media', 'text', 'function', 'restore']) status[k] = { status: 'UNTESTED', reason: 'startup-only repeat' };
      if (site.mode !== 'startup') status.surface = J.judgeSurface(a.main, a.startup);
      // Same layout? Text labels must largely match AND the ON capture's edges
      // must already exist in the OFF capture (color-independent). An overlay,
      // modal or carousel slide adds new edges; a defect that fades or blacks
      // out content only removes edges, so it can't hide behind this guard.
      const st = { ...(a.stable ?? {}) };
      for (const [k, p] of [['main', a.main], ['scrolled', a.scrolled], ['startup', a.startup]]) if (p?.edgeMatchRev != null) st[k] = Math.min(st[k] ?? 1, p.edgeMatchRev);
      if (a.restoreEdge != null) st.restore = Math.min(st.restore ?? 1, a.restoreEdge);
      const ok = (k) => st[k] == null || st[k] >= 0.7;
      if (site.mode !== 'startup') status.media = J.judgeMedia([ok('main') ? a.main : null, ok('scrolled') ? a.scrolled : null].filter(Boolean));
      if (site.mode !== 'startup') { status.text = J.judgeText(a.main); status.restore = J.judgeRestore(a.restore); }
      // Flat (undrawn) captures: nothing on them can be judged.
      const flatPairs = [['main', a.main, ['surface', 'media', 'text']], ['startup', a.startup, ['surface']]].filter(([, p]) => p && (p.flatOn || p.flatOff));
      for (const [name, p, keys] of flatPairs) for (const k of keys) if (status[k] && status[k].status !== 'BLOCKED')
        status[k] = { status: 'UNTESTED', reason: `capture ${p.flatOn ? 'with dark mode on' : 'with dark mode off'} (${name}) is one flat color: Safari did not draw the window (covered or mid-update); not judged` };
      for (const [k, pairName] of [['text', 'main'], ['surface', 'main'], ['restore', 'restore']]) {
        if (!ok(pairName) && status[k] && ['FAIL', 'PASS'].includes(status[k].status))
          status[k] = { status: 'NEEDS_REVIEW', reason: `page changed state between the paired captures (text overlap ${Math.round(st[pairName] * 100)}%: overlay, modal or carousel); automated result was ${status[k].status}: ${status[k].reason}` };
      }
      // iOS: the popup's own status line; Mac: the shortcut's effect seen on the page.
      const toggled = site.popupStatus ?? (site.toggles ? { on: site.toggles.on?.ok ? 'on (verified on the page)' : '', off: site.toggles.off2?.ok ? 'off' : '' } : {});
      if (site.mode !== 'startup') status.function = J.judgeFunction(readJ(join(sd, 'fresh-off.json')), readJ(join(sd, 'live-on.json')), toggled);
    }
    if (platform.startsWith('macos') && !blocked) applyMacDom(status, readJ(join(sd, 'fresh-off.json')), readJ(join(sd, 'live-on.json')), readJ(join(sd, 'live-off.json')), readJ(join(sd, 'startup-on.json')));
    // Fixture pages beacon what the page itself sees (DOM-side evidence).
    const fx = fixtureEvidence(beacon, site.url, events, id);
    if (fx && !blocked) applyFixture(status, fx, byId.get(id.split('~')[0]));
    const ready = Object.fromEntries(Object.entries(site.ready ?? {}).map(([k, v]) => [k, v.ok]));
    results[id] = { id, url: site.url, batch: b.split('/').pop(), manifest: byId.get(id.split('~')[0]) ?? null, repeatOf: id.includes('~') ? id.split('~')[0] : null, status, blocked, ready, activation, fixture: fx,
      evidence: 'automated', flash: (flash[id] ?? macFlash[id]) ? { ...(flash[id] ?? macFlash[id]), series: undefined } : null,
      metrics: { main: slim(a.main), startup: slim(a.startup), scrolled: slim(a.scrolled), restore: a.restore }, captures: a.caps };
  }
}
// macOS captures are DOM audits + a ScreenCaptureKit window shot; map CSS px
// rects into screenshot pixels (web content sits at the bottom of the window).
function normalize(c) {
  if (!c || !c.shot) return c;
  const sc = c.shot.w / (c.outer?.[0] || c.viewport[0]);
  const offY = c.shot.h - c.viewport[1] * sc;
  const r = (a) => [a[0] * sc, a[1] * sc + offY, a[2] * sc, a[3] * sc];
  return { ...c, scale: 1, viewport: [0, offY, c.viewport[0] * sc, c.viewport[1] * sc], pageRect: [0, offY, c.viewport[0] * sc, c.viewport[1] * sc],
    images: (c.media ?? []).map((x) => r(x.r)), texts: (c.texts ?? []).map((t) => ({ r: r(t.r), s: t.s })),
    counts: { link: c.counts?.links, button: c.counts?.buttons, field: c.counts?.inputs } };
}

function fixtureEvidence(beacon, url, events, id) {
  let path, search;
  try { const u = new URL(url); if (u.hostname !== 'localhost') return null; path = u.pathname; search = u.searchParams; } catch { return null; }
  const qaid = search.get('qaid');
  const mine = beacon.filter((x) => x.page === path && x.search && (qaid ? new URLSearchParams(x.search).get('qaid') === qaid : sameBad(new URLSearchParams(x.search), search)));
  if (!mine.length) return { beacons: 0 };
  const loads = mine.filter((x) => x.phase === 'done');
  const onLoads = loads.filter((x) => x.samples.some((s) => s.ready));
  const offLoads = loads.filter((x) => !x.samples.some((s) => s.ready || s.early));
  const startup = onLoads[0];
  // DOM-side flash: frames where the composited page background is light while
  // dark mode is on (early sheet or ready marker present, or marker came later).
  let domFlash = null;
  if (startup) {
    const s = startup.samples; const readyAt = s.find((x) => x.ready)?.t ?? null;
    const lightFrames = s.filter((x) => x.pageL > 0.5);
    domFlash = { frames: s.length, lightFrames: lightFrames.length, firstLightAt: lightFrames[0]?.t ?? null, lastLightAt: lightFrames.at(-1)?.t ?? null, readyAt, firstSampleAt: s[0]?.t };
  }
  const clicks = mine.filter((x) => x.phase === 'click').flatMap((x) => x.extra.clicks ?? []);
  const tapped = events.some((e) => e.event === 'tap' && e.tag === id);
  return { beacons: mine.length, startupAudit: startup?.extra.audit ?? null, offAudit: offLoads[0]?.extra.audit ?? null, domFlash, clicks: clicks.length, tapped };
}
function sameBad(a, b) { return (a.get('bad') ?? '') === (b.get('bad') ?? '') && (a.get('stall') ?? '') === (b.get('stall') ?? ''); }
function applyFixture(status, fx, m) {
  if (fx.domFlash) {
    const f = fx.domFlash;
    status.flashDom = f.lightFrames > 0
      ? { status: 'FAIL', reason: `page background computed light in ${f.lightFrames}/${f.frames} animation frames (${f.firstLightAt}–${f.lastLightAt} ms) while dark mode was on` }
      : { status: 'PASS', reason: `page background dark in all ${f.frames} animation frames from ${f.firstSampleAt} ms (ready at ${f.readyAt} ms)` };
  }
  const a = fx.startupAudit;
  if (a) {
    const low = a.text.filter((t) => t.contrast != null && t.contrast < 4.5);
    status.textDom = low.length ? { status: 'FAIL', reason: `${low.length}/${a.text.length} labelled texts under 4.5:1: ${low.map((t) => `${t.id} ${t.contrast}`).join(', ')}` }
      : { status: 'PASS', reason: `all ${a.text.length} labelled texts ≥4.5:1 (computed colors)` };
    const fx2 = a.media.filter((x) => x.effects.some((e) => /grayscale|invert|sepia|brightness\((0\.[0-8]|[0-7]\d%)|saturate\(0/.test(e.filter)) || x.opacity < 0.95);
    status.mediaDom = fx2.length ? { status: 'FAIL', reason: `${fx2.length} media with filter/opacity changes: ${fx2.map((x) => `${x.id}: ${x.effects.map((e) => e.filter).join(' > ')} op ${x.opacity}`).join('; ')}` }
      : { status: 'PASS', reason: `${a.media.length} media elements: no grayscale/invert/dim filter or opacity in their ancestor chain` };
  }
  if (m?.tap) {
    if (!fx.tapped) status.function = { status: 'UNTESTED', reason: 'tap target not found' };
    else if (fx.clicks === 0) status.function = { status: 'FAIL', reason: 'tapped the target with dark mode on; the page received no click (something intercepts taps)' };
    else status.function = { status: 'PASS', reason: `tap reached the page (${fx.clicks} click beacon${fx.clicks > 1 ? 's' : ''})` };
  }
}
// macOS live sites: computed-style evidence from the in-page audit.
function applyMacDom(status, off, on, restored, startup) {
  // The shortcut can fail to take (a page that swallows the key): judge the
  // live captures only when the page shows the state they are meant to show.
  const onActive = !!on?.markers?.ready;
  if (on && !onActive) {
    for (const k of ['surface', 'media', 'text']) if (status[k] && !['BLOCKED', 'NOT_APPLICABLE'].includes(status[k].status)) status[k] = { status: 'UNTESTED', reason: 'dark mode was not active on the page at the live-on capture (shortcut did not take, or the page is left as is)' };
    if (startup?.markers && !startup.markers.ready) { /* already-dark or site rule: fine */ } else status.textDom = { status: 'UNTESTED', reason: 'dark mode not active at the live-on capture' };
    on = null;
  }
  if (restored?.markers?.ready) { status.restoreDom = { status: 'UNTESTED', reason: 'turning off did not take before the capture (shortcut not received)' }; restored = null; }
  if (on?.texts?.length) {
    const offBy = new Map((off?.texts ?? []).map((t) => [t.s + t.tag, t]));
    const measurable = on.texts.filter((t) => !t.overImage);
    const low = measurable.filter((t) => t.c < (t.large ? 3 : 4.5) && (offBy.get(t.s + t.tag)?.c ?? 99) >= (t.large ? 3 : 4.5));
    const worse = low.filter((t) => t.c < 3);
    status.textDom = worse.length >= 3 && worse.length / measurable.length > 0.05
      ? { status: 'FAIL', reason: `${worse.length}/${measurable.length} visible texts under 3:1 with dark mode on (were readable): ${worse.slice(0, 4).map((t) => `"${t.s}" ${t.c}`).join(', ')}` }
      : low.length ? { status: 'NEEDS_REVIEW', reason: `${low.length}/${measurable.length} texts below their WCAG target (computed colors): ${low.slice(0, 4).map((t) => `"${t.s}" ${t.c}`).join(', ')}` }
      : { status: 'PASS', reason: `${measurable.length} visible texts meet 4.5:1 (3:1 large) by computed colors; ${on.texts.length - measurable.length} over images not scored` };
  }
  if (on?.media) {
    const bad = on.media.filter((m) => m.effects.some((e) => /grayscale|invert|sepia\(1|saturate\(0/.test(e[1])) || m.opacity < 0.9);
    status.mediaDom = bad.length ? { status: 'NEEDS_REVIEW', reason: `${bad.length}/${on.media.length} media have filter/opacity in their chain: ${bad.slice(0, 3).map((m) => `${m.tag} ${m.effects.map((e) => e[1] + '/' + e[2]).join('>')} op${m.opacity}`).join('; ')}` }
      : { status: 'PASS', reason: `${on.media.length} visible media: no grayscale/invert/dimming filters or opacity in their ancestor chain` };
  }
  if (restored) {
    const ok = !restored.markers?.ready && restored.markers?.ourStyles === 0 && restored.residue === 0;
    status.restoreDom = ok ? { status: 'PASS', reason: 'after turning off: no extension styles, markers or element attributes left' }
      : { status: 'FAIL', reason: `after turning off: ready=${restored.markers?.ready} styles=${restored.markers?.ourStyles} marked elements=${restored.residue}` };
  }
  if (startup?.markers && off) status.activation = startup.markers.ready ? { status: 'PASS', reason: 'extension ready marker present on this page' }
    : startup.markers.off ? { status: 'NOT_APPLICABLE', reason: 'content script ran and left the page as is (already dark, or a site rule)' }
    : { status: 'FAIL', reason: 'no sign of the content script on this page' };
}
function slim(p) { return p ? { brightOff: p.brightOff, brightOn: p.brightOn, lumOff: p.lumOff, lumOn: p.lumOn, images: p.images?.length, texts: p.texts?.length } : null; }

// Visual review records (written by hand after looking at captures) override
// the evidence label, never the status, unless they record a decision.
const reviews = readJ(join(dir, 'reviews.json')) ?? {};
for (const [id, r] of Object.entries(reviews)) if (results[id]) {
  results[id].evidence = 'visually-reviewed';
  results[id].review = r;
  for (const [k, v] of Object.entries(r.status ?? {})) results[id].status[k] = { ...v, reviewed: true };
}
// Sites whose run hung the iOS UI test (watchdog) have no captures: list them.
const ckp = readJ(join(dir, 'checkpoint.json'));
for (const [id, h] of Object.entries(ckp?.hung ?? {})) if (!results[id]) {
  results[id] = { id, url: byId.get(id)?.url, batch: h.batch?.split('/').pop(), manifest: byId.get(id) ?? null, evidence: 'automated', blocked: null,
    status: Object.fromEntries(['flash', 'surface', 'media', 'text', 'function', 'restore'].map((k) => [k, { status: 'UNTESTED', reason: `harness: the UI test stopped responding on this site (last step ${h.lastEvent?.tag ?? '?'}); not retried` }])) };
}
writeFileSync(join(dir, 'results.json'), JSON.stringify({ platform, env: readJ(join(dir, 'env.json')), setup: readJ(join(dir, 'setup.json')), thresholds: J.T, sites: results }, null, 1));
const tally = {};
for (const r of Object.values(results)) for (const [k, v] of Object.entries(r.status)) { tally[k] ??= {}; tally[k][v.status] = (tally[k][v.status] ?? 0) + 1; }
console.log(`${Object.keys(results).length} sites analyzed →`, join(dir, 'results.json'));
console.log(JSON.stringify(tally));
