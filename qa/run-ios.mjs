#!/usr/bin/env node
// iOS Simulator runner: installed Sunglasses extension in Mobile Safari.
//
//   node qa/run-ios.mjs setup                 build + install app, enable extension, prove activation
//   node qa/run-ios.mjs sites --set pilot     run a manifest set (smoke | pilot | p50 | full)
//   node qa/run-ios.mjs sites --ids a.com,b.com
//   options: --device "Sunglasses QA iPhone" --run <name> --batch 8 --retry 1 --fresh
//
// Each batch is one XCUITest invocation (SafariQAUITests/testRunJob) with its
// own simulator screen recording. Results land in build/qa/runs/<run>/ios-<device>/,
// a checkpoint (checkpoint.json) records finished sites so a rerun resumes.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest, pickSites } from './lib/manifest.js';
import { startServer } from './lib/server.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
const cmd = args[0] ?? 'help';
const DEVICE = opt('device', 'Sunglasses QA iPhone');
const RUN = opt('run', 'latest');
const DD = join(ROOT, 'build/QA-Runner');
const PROJECT = join(ROOT, 'qa/ios/SafariQA.xcodeproj');

const sh = (c, a, o = {}) => execFileSync(c, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...o });

function udid(name) {
  const list = JSON.parse(sh('xcrun', ['simctl', 'list', 'devices', 'available', '-j'])).devices;
  for (const devs of Object.values(list)) for (const d of devs) if (d.name === name || d.udid === name) return d;
  throw new Error(`no simulator named "${name}" (create it: xcrun simctl create "${name}" "iPhone 17")`);
}

function boot(dev) {
  if (dev.state !== 'Booted') { try { sh('xcrun', ['simctl', 'boot', dev.udid]); } catch {} }
  sh('xcrun', ['simctl', 'bootstatus', dev.udid, '-b']);
}

function runTest(dev, test, env, timeoutMs) {
  return new Promise((done) => {
    const a = ['test-without-building', '-project', PROJECT, '-scheme', 'SafariQAUITests',
      '-destination', `platform=iOS Simulator,id=${dev.udid}`, '-derivedDataPath', DD,
      `-only-testing:SafariQAUITests/SafariQAUITests/${test}`];
    const e = { ...process.env };
    for (const [k, v] of Object.entries(env)) e[`TEST_RUNNER_${k}`] = v;
    const p = spawn('xcodebuild', a, { env: e });
    let log = '';
    p.stdout.on('data', (b) => { log += b; });
    p.stderr.on('data', (b) => { log += b; });
    const t = setTimeout(() => { log += '\n[runner] timeout, killing\n'; p.kill('SIGTERM'); }, timeoutMs);
    // Watchdog: no new event for 4 minutes means Safari or the test is stuck
    // (seen: a frozen Safari under a popup). Kill the test and Safari; the
    // checkpoint keeps finished sites and the rest are retried.
    const ev = env.QA_OUT ? join(env.QA_OUT, 'events.jsonl') : null;
    const started = Date.now();
    const w = setInterval(() => {
      let last = started;
      try { last = Math.max(started, statSync(ev).mtimeMs); } catch {}
      if (Date.now() - last > 240000) {
        log += '\n[runner] no progress for 240 s, killing test and Safari\n';
        p.kill('SIGTERM');
        try { sh('xcrun', ['simctl', 'terminate', dev.udid, 'com.apple.mobilesafari']); } catch {}
      }
    }, 15000);
    p.on('close', (code) => { clearTimeout(t); clearInterval(w); done({ code, log }); });
  });
}

function record(dev, file) {
  const p = spawn('xcrun', ['simctl', 'io', dev.udid, 'recordVideo', '--codec=h264', '--force', file], { stdio: 'ignore' });
  return () => new Promise((r) => { p.on('close', r); p.kill('SIGINT'); setTimeout(r, 8000); });
}

function buildAll(dev) {
  console.log('building app (iOS Simulator) and QA runner…');
  sh('node', ['engine/scripts/bundle.js'], { cwd: ROOT });
  sh('xcodebuild', ['-scheme', 'Sunglasses for Safari (iOS)', '-destination', `platform=iOS Simulator,id=${dev.udid}`,
    '-derivedDataPath', join(ROOT, 'build/QA-iOS'), 'CODE_SIGN_IDENTITY=-', 'CODE_SIGNING_REQUIRED=NO', 'build', '-quiet'], { cwd: ROOT, maxBuffer: 1 << 26 });
  sh('xcodebuild', ['build-for-testing', '-project', PROJECT, '-scheme', 'SafariQAUITests',
    '-destination', `platform=iOS Simulator,id=${dev.udid}`, '-derivedDataPath', DD, '-quiet'], { cwd: ROOT, maxBuffer: 1 << 26 });
  const app = join(ROOT, 'build/QA-iOS/Build/Products/Debug-iphonesimulator/Sunglasses for Safari.app');
  sh('xcrun', ['simctl', 'install', dev.udid, app]);
  const info = JSON.parse(sh('plutil', ['-convert', 'json', '-o', '-', join(app, 'PlugIns/Sunglasses for Safari Extension.appex/Info.plist')]));
  const bundleHash = sh('shasum', ['-a', '256', join(app, 'PlugIns/Sunglasses for Safari Extension.appex/content/engine.js')]).split(' ')[0];
  return { appVersion: info.CFBundleShortVersionString, build: info.CFBundleVersion, engineSha256: bundleHash,
    gitHead: sh('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).trim(),
    gitDirty: sh('git', ['status', '--porcelain', 'engine', 'Extension'], { cwd: ROOT }).trim().length > 0 };
}

function environment(dev) {
  const rt = JSON.parse(sh('xcrun', ['simctl', 'list', 'runtimes', '-j'])).runtimes.find((r) => dev.runtime?.includes(r.identifier) || r.identifier === dev.runtime);
  // Which extension build is actually installed: hash its content script.
  let installed = null;
  try {
    const app = sh('xcrun', ['simctl', 'get_app_container', dev.udid, 'app.rarecreatures.sunglassesatnight', 'app']).trim();
    installed = sh('shasum', ['-a', '256', join(app, 'PlugIns/Sunglasses for Safari Extension.appex/content/engine.js')]).split(' ')[0];
  } catch {}
  return { platform: 'ios-simulator', installedEngineSha256: installed, device: dev.name, udid: dev.udid, deviceType: dev.deviceTypeIdentifier,
    runtime: rt ? `${rt.name} (${rt.buildversion})` : dev.runtime,
    appearance: sh('xcrun', ['simctl', 'ui', dev.udid, 'appearance']).trim(),
    xcode: sh('xcodebuild', ['-version']).trim().replace(/\n/g, ' '), host: sh('sw_vers', ['-productVersion']).trim() };
}

async function main() {
  const dev = udid(DEVICE);
  boot(dev);
  const out = join(ROOT, 'build/qa/runs', RUN, `ios-${dev.name.replace(/\W+/g, '-')}`);
  mkdirSync(out, { recursive: true });
  const server = await startServer({ port: Number(process.env.QA_PORT || 8765), beaconDir: join(out, 'beacons') }).catch(() => null);
  if (!server) console.log('fixture server already running on 8765 (beacons go to its own folder)');
  try {
    if (cmd === 'setup') {
      const build = buildAll(dev);
      const r = await runTest(dev, 'testEnableExtension', { QA_OUT: join(out, 'setup') }, 180000);
      writeFileSync(join(out, 'setup.json'), JSON.stringify({ build, env: environment(dev), enable: r.code === 0 }, null, 2));
      console.log(r.code === 0 ? 'extension enabled' : r.log.slice(-2000));
      return;
    }
    if (cmd === 'sites') {
      const manifest = loadManifest(opt('set') === 'fixtures' ? 'fixtures' : 'sites');
      const picked = pickSites(manifest, { set: opt('set'), ids: opt('ids')?.split(',') });
      // --repeat N: each site N times (startup flash checks need repeats); ids get ~r2, ~r3…
      const reps = Number(opt('repeat', 1));
      const sites = picked.flatMap((x) => Array.from({ length: reps }, (_, k) => (k === 0 ? x : { ...x, id: `${x.id}~r${k + 1}` })));
      const ckFile = join(out, 'checkpoint.json');
      const ck = existsSync(ckFile) && !flag('fresh') ? JSON.parse(readFileSync(ckFile, 'utf8')) : { done: {}, attempts: {} };
      const todo = sites.filter((s) => !ck.done[s.id]);
      const batch = Number(opt('batch', 6));
      const maxTry = 1 + Number(opt('retry', 1));
      console.log(`${sites.length} sites, ${todo.length} to run, batches of ${batch} → ${out}`);
      const env = environment(dev);
      writeFileSync(join(out, 'env.json'), JSON.stringify(env, null, 2));
      console.log(`installed engine ${env.installedEngineSha256?.slice(0, 12)}`);
      for (let i = 0; i < todo.length; i += batch) {
        const group = todo.slice(i, i + batch).filter((s) => (ck.attempts[s.id] ?? 0) < maxTry);
        if (!group.length) continue;
        const bdir = join(out, `batch-${Date.now()}`);
        mkdirSync(bdir, { recursive: true });
        const runId = bdir.split('/').pop();
        const job = { ...(flag('startup-only') ? { mode: 'startup' } : {}), fixture: `http://localhost:8765/activation.html?run=${runId}`, go: `http://localhost:8765/go.html?run=${runId}`,
          sites: group.map((s) => ({ id: s.id, url: (s.ios?.url ?? s.url).replace('{run}', `${runId}&qaid=${encodeURIComponent(s.id)}`), scrolls: s.scrolls ?? 2, ...(s.tap ? { tap: s.tap } : {}) })) };
        writeFileSync(join(bdir, 'job.json'), JSON.stringify(job, null, 2));
        writeFileSync(join(bdir, 'env.json'), JSON.stringify(env, null, 2));
        // Video t=0 is (within ~0.3 s) the moment recordVideo is spawned; the
        // flash windows are padded by more than that.
        const spawnWall = Date.now() / 1000;
        const stop = record(dev, join(bdir, 'screen.mp4'));
        writeFileSync(join(bdir, 'rec-start.json'), JSON.stringify({ wall: spawnWall, note: 'wall clock at recordVideo spawn' }));
        await new Promise((r) => setTimeout(r, 1500));
        const r = await runTest(dev, 'testRunJob', { QA_OUT: bdir, QA_JOB: join(bdir, 'job.json') }, (90 + group.length * (flag('startup-only') ? 40 : 150)) * 1000);
        await stop();
        writeFileSync(join(bdir, 'xcodebuild.log'), r.log);
        // The site the test was on when it hung (watchdog) is recorded and not
        // retried; sites the batch never reached keep their attempt.
        let hungId = null;
        if (/no progress for 240 s/.test(r.log) && existsSync(join(bdir, 'events.jsonl'))) {
          const last = readFileSync(join(bdir, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.tag).at(-1);
          hungId = last?.tag?.split('/')[0] ?? null;
          if (hungId) { ck.hung = ck.hung ?? {}; ck.hung[hungId] = { batch: bdir, lastEvent: last }; }
        }
        let reached = true;
        for (const s of group) {
          const done = existsSync(join(bdir, s.id, 'site.json'));
          if (done) ck.done[s.id] = bdir;
          if (s.id === hungId) { ck.attempts[s.id] = maxTry; reached = false; continue; }
          if (done || reached) ck.attempts[s.id] = (ck.attempts[s.id] ?? 0) + 1;
        }
        writeFileSync(ckFile, JSON.stringify(ck, null, 2));
        const n = sites.filter((x) => ck.done[x.id]).length;
        console.log(`batch ${bdir.split('-').pop()}: ${group.filter((s) => ck.done[s.id] === bdir).length}/${group.length} done (total ${n}/${sites.length})`);
      }
      return;
    }
    console.log('usage: node qa/run-ios.mjs setup | sites --set pilot|p50|full|smoke [--device name] [--run name]');
  } finally {
    server?.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
