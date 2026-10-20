#!/usr/bin/env node
// Cool-down mode: finish the saved Safari QA runs gently, for an unattended
// overnight run on a plugged-in Mac.
//
//   node qa/cooldown.mjs                 Mac rows still pending, then iPhone rows
//   node qa/cooldown.mjs --platform ios  only one platform (mac | ios | both)
//   node qa/cooldown.mjs --dry-run       list what would run, run nothing
//   options: --pause 20 (seconds between sites), --mac-run final, --ios-run fixed
//
// - One site at a time, one platform at a time (never Mac and iPhone together),
//   with a pause between sites.
// - Before every site it checks the Mac's thermal state and load; when either
//   is high it waits, re-checking every minute, until the Mac has cooled.
// - Resumes from the runners' checkpoints: a site already done, recorded as
//   hung, or out of attempts is skipped. Ctrl-C stops after killing the
//   current site; run the same command again to continue.
// - Keeps the display awake while it runs (caffeinate): the Mac test window
//   has to stay drawn and uncovered.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, appendFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadManifest } from './lib/manifest.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
const PLATFORM = opt('platform', 'both');
const PAUSE = Number(opt('pause', 20)) * 1000;
const MAC_RUN = opt('mac-run', 'final');
const IOS_RUN = opt('ios-run', 'fixed');
const IOS_DEVICE = opt('device', 'Sunglasses QA iPhone');
const MAX_TRY = 2;
const NCPU = cpus().length;
const LOG = join(ROOT, 'build/qa/cooldown.log');
const LOCK = join(ROOT, 'build/qa/cooldown.lock');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(join(ROOT, 'build/qa'), { recursive: true });

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

function thermal() {
  try { return JSON.parse(execFileSync(join(ROOT, 'build/qa-mac'), ['thermal'], { encoding: 'utf8', timeout: 10000 })).thermalState; } catch { return 0; }
}
function load1() {
  try { return Number(execFileSync('sysctl', ['-n', 'vm.loadavg'], { encoding: 'utf8' }).replace(/[{}]/g, '').trim().split(/\s+/)[0]); } catch { return 0; }
}
// Hot: thermal state serious/critical, or 1-minute load above the core count.
// Cool again: thermal nominal/fair and load below 60% of the cores.
async function waitCool() {
  let t = thermal(), l = load1();
  if (t < 2 && l <= NCPU) return;
  log(`pausing: thermal state ${t}, load ${l.toFixed(1)} (${NCPU} cores)`);
  while (!(t <= 1 && l < NCPU * 0.6)) {
    await sleep(60000);
    t = thermal(); l = load1();
  }
  log(`cooled: thermal state ${t}, load ${l.toFixed(1)}; resuming`);
}

function otherRunsActive() {
  try {
    const ps = execFileSync('ps', ['-Ao', 'pid,command'], { encoding: 'utf8' });
    return ps.split('\n').filter((l) => /qa\/run-(mac|ios)\.mjs/.test(l) && !l.includes(String(process.pid)));
  } catch { return []; }
}

function pending(platformDir) {
  const ck = existsSync(join(platformDir, 'checkpoint.json')) ? JSON.parse(readFileSync(join(platformDir, 'checkpoint.json'), 'utf8')) : { done: {}, attempts: {} };
  return loadManifest().sites.map((s) => s.id)
    .filter((id) => !ck.done?.[id] && !ck.hung?.[id] && (ck.attempts?.[id] ?? 0) < MAX_TRY);
}

let child = null;
function runOne(cmd, cmdArgs, timeoutMs) {
  return new Promise((done) => {
    child = spawn(cmd, cmdArgs, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (b) => { out += b; });
    child.stderr.on('data', (b) => { out += b; });
    const t = setTimeout(() => { out += '\n[cooldown] site timeout, stopping it\n'; child?.kill('SIGTERM'); }, timeoutMs);
    child.on('close', (code) => { clearTimeout(t); child = null; done({ code, out }); });
  });
}

async function phase(name, platformDir, siteCmd) {
  const todo = pending(platformDir);
  log(`${name}: ${todo.length} sites pending in ${platformDir.replace(ROOT, '')}`);
  if (flag('dry-run')) { console.log(todo.join(' ')); return; }
  for (const [i, id] of todo.entries()) {
    if (stopping) return;
    await waitCool();
    const t0 = Date.now();
    const r = await runOne('node', siteCmd(id), 15 * 60000);
    const last = r.out.trim().split('\n').filter(Boolean).at(-1) ?? '';
    log(`${name} ${i + 1}/${todo.length} ${id}: exit ${r.code} in ${Math.round((Date.now() - t0) / 1000)} s ${last.slice(0, 160)}`);
    if (stopping) return;
    await sleep(PAUSE);
  }
  const a = await runOne('node', ['qa/analyze.mjs', platformDir], 60 * 60000);
  log(`${name}: analyzed ${a.out.trim().split('\n').filter(Boolean).at(-2) ?? ''}`);
}

let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
  log('stopping (Ctrl-C): current site killed, progress is in the checkpoints');
  child?.kill('SIGTERM');
});

async function main() {
  const others = otherRunsActive();
  if (others.length) { console.error(`another QA run is active, not starting:\n${others.join('\n')}`); process.exit(1); }
  if (existsSync(LOCK) && !flag('dry-run')) {
    const pid = Number(readFileSync(LOCK, 'utf8'));
    try { process.kill(pid, 0); console.error(`cool-down already running (pid ${pid})`); process.exit(1); } catch { /* stale lock */ }
  }
  if (!flag('dry-run')) writeFileSync(LOCK, String(process.pid));
  const awake = flag('dry-run') ? null : spawn('caffeinate', ['-di', '-w', String(process.pid)], { stdio: 'ignore' });
  try {
    log(`cool-down start: platform ${PLATFORM}, ${PAUSE / 1000} s between sites, ${NCPU} cores`);
    if (PLATFORM !== 'ios') {
      await phase('mac', join(ROOT, 'build/qa/runs', MAC_RUN, 'macos-safari'),
        (id) => ['qa/run-mac.mjs', 'sites', '--ids', id, '--run', MAC_RUN, '--retry', String(MAX_TRY - 1)]);
    }
    if (PLATFORM !== 'mac' && !stopping) {
      const dir = join(ROOT, 'build/qa/runs', IOS_RUN, `ios-${IOS_DEVICE.replace(/\W+/g, '-')}`);
      await phase('ios', dir,
        (id) => ['qa/run-ios.mjs', 'sites', '--ids', id, '--run', IOS_RUN, '--batch', '1', '--retry', String(MAX_TRY - 1), '--device', IOS_DEVICE]);
      // Cool the Mac down: shut down the QA simulator only (never anyone else's).
      if (!flag('dry-run')) { try { execFileSync('xcrun', ['simctl', 'shutdown', IOS_DEVICE], { timeout: 60000 }); } catch {} }
    }
    log('cool-down finished');
  } finally {
    awake?.kill();
    if (!flag('dry-run')) { try { unlinkSync(LOCK); } catch {} }
  }
}
main().catch((e) => { log(`cool-down error: ${e.message}`); process.exit(1); });
