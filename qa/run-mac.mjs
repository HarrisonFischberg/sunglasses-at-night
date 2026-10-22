#!/usr/bin/env node
// macOS runner: the installed Sunglasses extension in the user's real Safari.
//
//   node qa/run-mac.mjs check                  prerequisites, extension proof on a fixture
//   node qa/run-mac.mjs sites --set pilot      (smoke | pilot | p50 | full | fixtures) [--ids a,b] [--run name]
//
// Uses a dedicated Safari window it opens itself. Navigation and page reads go
// through AppleScript (Safari ▸ Developer ▸ "Allow JavaScript from Apple
// Events"); dark mode is switched with the extension's own keyboard shortcut
// (Option+Shift+N, needs Accessibility for the calling app); the window is
// captured and recorded with ScreenCaptureKit (needs Screen Recording).
// Safari is brought to the front for each shortcut press.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest, pickSites } from './lib/manifest.js';
import { startServer } from './lib/server.js';
import { AUDIT_JS } from './lib/page-audit.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
const cmd = args[0] ?? 'help';
const RUN = opt('run', 'latest');
const MAC = join(ROOT, 'build/qa-mac');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now() / 1000;

function ensureMacTool() {
  const src = join(ROOT, 'qa/tools/qa-mac.swift');
  if (!existsSync(MAC) || (existsSync(src) && readFileSync(src).length && execFileSync('stat', ['-f', '%m', src]).toString() > execFileSync('stat', ['-f', '%m', MAC]).toString()))
    execFileSync('swiftc', ['-O', src, '-o', MAC], { stdio: 'inherit' });
}
// Bounded: a page that keeps Safari's JavaScript busy must not hang the run.
const osa = (script) => execFileSync('osascript', ['-e', script], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 25000 }).trim();
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

let WIN = null; // { asId (AppleScript window id), cgId (CGWindowID) }
function js(code) {
  return osa(`tell application "Safari" to do JavaScript "${esc(code)}" in current tab of (first window whose id is ${WIN.asId})`);
}
function setUrl(url) {
  osa(`tell application "Safari" to set URL of current tab of (first window whose id is ${WIN.asId}) to "${esc(url)}"`);
}
function frontApp() { try { return osa('tell application "System Events" to get name of first process whose frontmost is true'); } catch { return null; } }
async function pressToggle() {
  const prev = frontApp();
  // A focused text field (PubMed's search box) takes Option+Shift+N as a typed
  // character, so the extension never sees the command: blur it first.
  try { js('document.activeElement && document.activeElement !== document.body && document.activeElement.blur(); 1'); } catch {}
  osa(`tell application "Safari" to set index of (first window whose id is ${WIN.asId}) to 1`);
  osa('tell application "Safari" to activate');
  await sleep(250);
  osa('tell application "System Events" to keystroke "n" using {option down, shift down}');
  await sleep(200);
  if (prev && prev !== 'Safari') { try { osa(`tell application "${esc(prev)}" to activate`); } catch {} }
}
function audit() { try { return JSON.parse(js(AUDIT_JS)); } catch (e) { return { error: String(e.message).slice(0, 300) }; } }
function markers() { try { return JSON.parse(js("JSON.stringify({ready: document.documentElement.hasAttribute('data-sunglasses-ready'), off: document.documentElement.hasAttribute('data-sunglasses-off'), ours: document.querySelectorAll('style[data-sunglasses-at-night]').length, rs: document.readyState, res: performance.getEntriesByType('resource').length})")); } catch { return null; } }

/** Turn dark mode on/off with the shortcut, verified on the page itself.
 * A page with the extension's styles is on; a page without them is off OR
 * already dark (left alone), so there the state the runner tracked since
 * the last unambiguous check decides. Never more than one press per check. */
let tracked = null; // last known mode state: true on, false off
async function setDark(on) {
  let presses = 0;
  const styledNow = () => { const m = markers(); return { m, styled: !!(m && (m.ready || m.ours > 0)) }; };
  for (let i = 0; i < 3; i++) {
    const { m, styled } = styledNow();
    const actual = styled ? true : (tracked ?? false);
    if (styled) tracked = true;
    if (actual === on) return { ok: true, markers: m, presses, by: styled ? 'page' : 'tracked' };
    await pressToggle();
    presses++;
    tracked = !actual;
    // Give the page up to 3 s to show the change.
    for (let k = 0; k < 10; k++) {
      await sleep(300);
      const r = styledNow();
      if (r.styled === on) { tracked = on; return { ok: true, markers: r.m, presses, by: 'page' }; }
    }
    // Still unstyled after "on": an already-dark page; trust the press.
    if (on) return { ok: true, markers: markers(), presses, by: 'tracked' };
  }
  return { ok: false, markers: markers(), presses };
}

/** Re-establish the real state on the light-only proof page, then set it. */
async function syncOnProof(proofUrl, on) {
  setUrl(proofUrl);
  await waitReady(10);
  await readProofState();
  return setDark(on);
}

// On the light-only proof page the content script marks <html> with
// data-sunglasses-off as soon as it has decided, and adds its sheet in the
// same task when dark mode is on: wait for the mark, then read the state.
async function readProofState() {
  for (let k = 0; k < 20; k++) {
    const m = markers();
    if (m?.off) { await sleep(300); const m2 = markers(); tracked = !!(m2 && (m2.ready || m2.ours > 0)); return tracked; }
    await sleep(250);
  }
  const m = markers();
  tracked = !!(m && (m.ready || m.ours > 0));
  return tracked;
}

async function waitReady(timeout = 20) {
  const t0 = now(); let last = -1, stableFor = 0, m = null;
  await sleep(800);
  while (now() - t0 < timeout) {
    m = markers();
    if (m && m.rs === 'complete' && m.res === last) stableFor += 0.5; else stableFor = 0;
    last = m?.res ?? -1;
    if (stableFor >= 1.5) return { ok: true, secs: now() - t0, markers: m };
    await sleep(500);
  }
  return { ok: false, secs: now() - t0, markers: m };
}

function shot(file) { return JSON.parse(execFileSync(MAC, ['shot', String(WIN.cgId), file], { encoding: 'utf8', timeout: 30000 })); }

function startRecording(file, secs) {
  const p = spawn(MAC, ['record', String(WIN.cgId), file, String(secs)]);
  let outp = ''; p.stdout.on('data', (b) => { outp += b; });
  const done = new Promise((r) => p.on('close', () => { try { r(JSON.parse(outp)); } catch { r({ error: outp }); } }));
  // Bounded: a recorder that does not exit within 20 s of stop is killed.
  return { stop: () => { writeFileSync(file + '.stop', ''); return Promise.race([done, sleep(20000).then(() => { p.kill('SIGKILL'); return { error: 'recorder did not stop' }; })]); }, done };
}

let WIN_IDS_BEFORE = [];
async function openWindow(fixtureUrl) {
  WIN_IDS_BEFORE = JSON.parse(execFileSync(MAC, ['windows'], { encoding: 'utf8' })).map((x) => x.id);
  osa(`tell application "Safari" to make new document with properties {URL:"${esc(fixtureUrl)}"}`);
  await sleep(2500);
  const asId = osa('tell application "Safari" to get id of front window');
  osa(`tell application "Safari" to set bounds of (first window whose id is ${asId}) to {60, 60, 1340, 900}`);
  await sleep(800);
  const title = osa(`tell application "Safari" to get name of current tab of (first window whose id is ${asId})`) || '';
  const wins = JSON.parse(execFileSync(MAC, ['windows'], { encoding: 'utf8' }));
  const before = new Set(WIN_IDS_BEFORE);
  const w = wins.find((x) => !before.has(x.id) && x.frame[2] > 300 && (x.title === title || x.onScreen)) ?? wins.find((x) => x.title === title);
  if (!w) throw new Error(`could not find the QA window (${title}) among ${wins.map((x) => x.title).join(' | ')}`);
  WIN = { asId, cgId: w.id };
  return WIN;
}

function environment() {
  const safari = execFileSync('defaults', ['read', '/Applications/Safari.app/Contents/Info', 'CFBundleShortVersionString'], { encoding: 'utf8' }).trim();
  const appearance = (() => { try { return execFileSync('defaults', ['read', '-g', 'AppleInterfaceStyle'], { encoding: 'utf8' }).trim(); } catch { return 'Light'; } })();
  const ext = execFileSync('pluginkit', ['-mAvvv', '-p', 'com.apple.Safari.web-extension'], { encoding: 'utf8' }).split('\n\n').find((b) => b.includes('sunglassesatnight')) ?? '';
  const appex = /Path = (.*)/.exec(ext)?.[1];
  const sha = appex && existsSync(join(appex, 'Contents/Resources/content/engine.js')) ? execFileSync('shasum', ['-a', '256', join(appex, 'Contents/Resources/content/engine.js')], { encoding: 'utf8' }).split(' ')[0] : null;
  return { platform: 'macos-safari', safari, macos: execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim(), appearance, extensionPath: appex, engineSha256: sha,
    repoEngineSha256: execFileSync('shasum', ['-a', '256', join(ROOT, 'Extension/Resources/content/engine.js')], { encoding: 'utf8' }).split(' ')[0],
    gitHead: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim() };
}

async function main() {
  ensureMacTool();
  const out = join(ROOT, 'build/qa/runs', RUN, 'macos-safari');
  mkdirSync(out, { recursive: true });
  // Own port, so a concurrent iOS run (which serves on 8765) keeps its beacons apart.
  const PORT = Number(process.env.QA_MAC_PORT || 8766);
  const server = await startServer({ port: PORT, beaconDir: join(out, 'beacons') });
  const bname = `batch-${Date.now()}`; const bdir = join(out, bname); mkdirSync(bdir, { recursive: true });
  const ev = (e) => { const line = JSON.stringify({ ...e, wall: now() }); writeFileSync(join(bdir, 'events.jsonl'), line + '\n', { flag: 'a' }); };
  try {
    const env = environment();
    writeFileSync(join(out, 'env.json'), JSON.stringify(env, null, 2));
    // Safari's HTTPS-Only mode refuses http:// fixtures; then the activation
    // proof uses a minimal public HTTPS page instead (example.com).
    const fixtureUrl = `http://localhost:${PORT}/activation.html?run=${bname}`;
    const proofUrl = process.env.QA_MAC_PROOF_URL || 'https://www.gnu.org/philosophy/free-sw.html';
    const httpOk = process.env.QA_MAC_HTTP === '1'; // set when Safari's HTTPS-Only mode is off
    await openWindow(proofUrl);
    await waitReady(10);
    // A light-only page: styled means on, unstyled means off. Establishes the
    // tracked state before anything is pressed.
    await readProofState();
    const on = await setDark(true);
    setUrl((httpOk ? fixtureUrl + '&phase=on' : proofUrl) + '#proof');
    const r = await waitReady(10);
    await sleep(800);
    const proof = { env, toggled: on, ready: r, httpFixtures: httpOk, page: httpOk ? fixtureUrl : proofUrl, audit: audit(), engineMatchesRepo: env.engineSha256 === env.repoEngineSha256 };
    if (!httpOk) console.log('note: activation proof on a public HTTPS page (Safari HTTPS-Only mode blocks http:// fixtures unless QA_MAC_HTTP=1)');
    writeFileSync(join(bdir, 'activation.json'), JSON.stringify(proof, null, 2));
    console.log(`extension active on fixture: ${!!proof.audit.markers?.ready}, page luminance ${proof.audit.pageL}, installed engine == repo: ${proof.engineMatchesRepo}`);
    if (cmd === 'check') return;
    const fixtures = opt('set') === 'fixtures';
    const picked = pickSites(loadManifest(fixtures ? 'fixtures' : 'sites'), { set: opt('set'), ids: opt('ids')?.split(',') });
      // --repeat N: each site N times (startup flash checks need repeats); ids get ~r2, ~r3…
      const reps = Number(opt('repeat', 1));
      const sites = picked.flatMap((x) => Array.from({ length: reps }, (_, k) => (k === 0 ? x : { ...x, id: `${x.id}~r${k + 1}` })));
    const ckFile = join(out, 'checkpoint.json');
    const ck = existsSync(ckFile) && !flag('fresh') ? JSON.parse(readFileSync(ckFile, 'utf8')) : { done: {}, attempts: {} };
    const maxTry = 1 + Number(opt('retry', 1));
    for (const s of sites) {
      if (ck.done[s.id] || (ck.attempts[s.id] ?? 0) >= maxTry) continue;
      ck.attempts[s.id] = (ck.attempts[s.id] ?? 0) + 1;
      // The runner's window may have been closed: open a new one.
      try { osa(`tell application "Safari" to get id of (first window whose id is ${WIN.asId})`); }
      catch {
        // Window gone or Safari unresponsive: give it a moment, then a fresh window.
        await sleep(5000);
        try { await openWindow(proofUrl); await waitReady(10); await readProofState(); }
        catch (e) { console.log(`could not reopen the Safari window: ${String(e.message).slice(0, 120)}`); continue; }
      }
      const sd = join(bdir, s.id); mkdirSync(sd, { recursive: true });
      const url = (s.mac?.url ?? s.url).replace('{run}', `${bname}&qaid=${encodeURIComponent(s.id)}`).replace('localhost:8765/', `localhost:${PORT}/`);
      const site = { id: s.id, url, ready: {}, captures: {}, audits: {}, toggles: {} };
      const cap = (name) => { const sh = shot(join(sd, `${name}.png`)); const a = audit(); writeFileSync(join(sd, `${name}.json`), JSON.stringify({ ...a, shot: sh })); site.captures[name] = true; return a; };
      try {
        ev({ event: 'site-start', tag: s.id, url });
        // Every site starts from the light-only proof page with dark mode verified on:
        // the state is never inferred across sites.
        site.toggles.startup = await syncOnProof(proofUrl, true);
        // Startup: recording runs from before navigation to readiness.
        const rec = startRecording(join(sd, 'startup.mov'), 40);
        await sleep(700);
        ev({ event: 'nav-start', tag: `${s.id}/startup-on`, url, via: 'applescript' });
        const navWall = now();
        setUrl(url);
        site.ready['startup-on'] = await waitReady(25);
        await sleep(600);
        const recInfo = await rec.stop();
        site.recording = { ...recInfo, navWall, readyWall: navWall + site.ready['startup-on'].secs };
        cap('startup-on');
        if (flag('startup-only')) { site.mode = 'startup'; writeFileSync(join(sd, 'site.json'), JSON.stringify(site, null, 1)); ck.done[s.id] = bname; ev({ event: 'site-done', tag: s.id }); writeFileSync(ckFile, JSON.stringify(ck, null, 2)); console.log(`${s.id} done`); continue; }
        site.toggles.off1 = await setDark(false);
        js('location.reload()');
        site.ready['fresh-off'] = await waitReady(25);
        cap('fresh-off');
        site.toggles.on = await setDark(true);
        await sleep(1200);
        cap('live-on');
        if (s.tap) { try { js(`(() => { const t = [...document.querySelectorAll('button,a')].find((e) => e.textContent.trim() === ${JSON.stringify(s.tap)}); t?.click(); return !!t; })()`); ev({ event: 'tap', tag: s.id, label: s.tap, via: 'dom-click' }); } catch {} await sleep(1500); cap('tapped-on'); }
        site.toggles.off2 = await setDark(false);
        await sleep(1000);
        cap('live-off');
        if ((s.scrolls ?? 2) > 0) {
          js(`window.scrollBy(0, Math.round(innerHeight * ${0.75 * (s.scrolls ?? 2)}))`);
          await sleep(1800);
          cap('scrolled-off');
          site.toggles.on2 = await setDark(true);
          await sleep(1200);
          cap('scrolled-on');
        } else site.toggles.on2 = await setDark(true);
        writeFileSync(join(sd, 'site.json'), JSON.stringify(site, null, 1));
        ck.done[s.id] = bname;
        ev({ event: 'site-done', tag: s.id });
      } catch (e) {
        ev({ event: 'site-error', tag: s.id, error: String(e.message).slice(0, 400) });
        console.log(`${s.id}: ${String(e.message).slice(0, 200)}`);
      }
      writeFileSync(ckFile, JSON.stringify(ck, null, 2));
      console.log(`${s.id} ${ck.done[s.id] ? 'done' : 'failed'} (${sites.filter((x) => ck.done[x.id]).length}/${sites.length})`);
    }
  } finally {
    // Close the runner's own window; the user's windows are never touched.
    if (WIN) { try { osa(`tell application "Safari" to close (first window whose id is ${WIN.asId})`); } catch {} }
    server?.close();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
