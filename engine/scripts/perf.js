// T013 performance budget, measured in Playwright WebKit (`npm run perf`;
// also run by e2e/perf.test.js so the runner's e2e pass records it).
//
// Fixtures (e2e/perf/fixtures.js) are served from two loopback servers this
// script starts: the site origin and a "cdn" origin whose sheets the CSSOM
// can't read. Engine time comes from the engine's own task monitor
// (startDynamic opts.monitor, via e2e/perf/entry.js); frame gaps come from a
// requestAnimationFrame recorder installed before any page script.
//
// Budgets (prd.md T013):
//   5,000-node page: initial pass ≤ 50 ms (median of 7 loads), mutation
//     batch ≤ 8 ms (median of 10 batches of 50 mutations)
//   product grid: no engine task > 50 ms after first paint; engine time
//     during the 5 s mutation storm ≤ 10% of wall time; rAF gaps ≤ 32 ms
//     while it scrolls through the storm
// Writes ralph/evidence/t013-perf.json; exits 1 when a budget is missed.

import { createServer } from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { webkit } from 'playwright';
import { bundle } from './bundle.js';
import { createSheetMessageHandler } from '../src/sheet-fetch.js';
import { route, NODES, GRID } from '../../e2e/perf/fixtures.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const OUT = resolve(ROOT, 'ralph/evidence/t013-perf.json');

export const BUDGET = Object.freeze({
  initialMedianMs: 50, batchMedianMs: 8, longTaskMs: 50, stormShare: 0.10, rafGapMs: 32,
});
const NODE_LOADS = 7, BATCHES = 10, BATCH_WINDOW_MS = 400, INITIAL_WINDOW_MS = 900;

const FRAME_RECORDER = `(() => {
  const p = (globalThis.__sanPerf ??= { tasks: [], frames: [] });
  const loop = (t) => { p.frames.push(t); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
})();`;

function serve(urls) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const hit = route(url.pathname, url.searchParams, urls());
    if (!hit) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': hit.type, 'cache-control': 'no-store' });
    res.end(hit.body);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

async function startServers() {
  let urls = {};
  const site = await serve(() => urls), cdn = await serve(() => urls);
  urls = { SITE: `http://127.0.0.1:${site.address().port}`, CDN: `http://127.0.0.1:${cdn.address().port}` };
  return { ...urls, close: () => Promise.all([site, cdn].map((s) => new Promise((r) => s.close(r)))) };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : NaN;
};
const round = (x) => Math.round(x * 100) / 100;
const sum = (tasks) => tasks.reduce((t, x) => t + x.ms, 0);

async function openPage(browser, servers, path, { engine }) {
  const context = await browser.newContext({ colorScheme: 'light', viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript({ content: FRAME_RECORDER });
  if (engine) {
    const handler = createSheetMessageHandler({
      fetch: (url, init) => fetch(url, { ...init, cache: undefined }), extensionId: 'perf',
    });
    await page.exposeFunction('__sanBackground', (msg) => new Promise((done) => {
      if (handler(msg, { tab: { id: 1 }, id: 'perf' }, done) === false) done(undefined);
    }));
    await page.addInitScript({ content: bundle(resolve(ROOT, 'e2e/perf/entry.js')) });
  }
  await page.goto(servers.SITE + path, { waitUntil: 'load' });
  if (engine) await page.waitForFunction(() => globalThis.__sanPerf.engine);
  return { page, context };
}

const tasksIn = (page, from, to) =>
  page.evaluate(([a, b]) => __sanPerf.tasks.filter((t) => t.start >= a && t.start < b), [from, to]);

async function measureNodes(browser, servers) {
  const initial = [], initialSync = [], batches = [];
  let overrideBytes = 0;
  for (let run = 0; run < NODE_LOADS; run++) {
    const { page, context } = await openPage(browser, servers, '/perf/nodes.html', { engine: true });
    const start = await page.evaluate(() => __sanPerf.tasks.find((t) => t.name === 'start').start);
    await page.waitForTimeout(INITIAL_WINDOW_MS);
    const tasks = await tasksIn(page, start, start + INITIAL_WINDOW_MS);
    initial.push(sum(tasks));
    initialSync.push(tasks.find((t) => t.name === 'start').ms);
    if (run === 0) {
      const counts = await page.evaluate(() => ({
        elements: document.querySelectorAll('main *').length,
        override: document.querySelector('style[data-sunglasses-at-night="override"]')?.textContent.length ?? 0,
      }));
      overrideBytes = counts.override;
      if (counts.elements < 5000) throw new Error(`nodes fixture has ${counts.elements} elements, expected ≥ 5000`);
      for (let b = 0; b < BATCHES; b++) {
        const mark = await page.evaluate(() => {
          const t = performance.now();
          __batch();
          return t;
        });
        await page.waitForTimeout(BATCH_WINDOW_MS);
        batches.push(sum(await tasksIn(page, mark, mark + BATCH_WINDOW_MS)));
      }
    }
    await context.close();
  }
  return {
    elements: NODES.sections * NODES.perSection,
    sheets: NODES.sheets, rules: NODES.sheets * NODES.rulesPerSheet, overrideBytes,
    initialMs: initial.map(round), initialSyncMs: initialSync.map(round),
    initialMedianMs: round(median(initial)),
    batchMutations: 50, batchMs: batches.map(round), batchMedianMs: round(median(batches)),
  };
}

async function storm(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const res = await page.evaluate(() => __storm());
  const data = await page.evaluate(([a, b]) => ({
    frames: __sanPerf.frames.filter((t) => t >= a && t <= b),
    tasks: __sanPerf.tasks.filter((t) => t.start >= a && t.start < b),
  }), [res.t0, res.t1]);
  const gaps = data.frames.slice(1).map((t, i) => t - data.frames[i]);
  const wall = res.t1 - res.t0;
  const engineMs = sum(data.tasks);
  return {
    wallMs: round(wall), mutations: res.mutations, frames: data.frames.length,
    rafGapMaxMs: round(Math.max(...gaps)), rafGapP95Ms: round(pct(gaps, 95)), rafGapP99Ms: round(pct(gaps, 99)),
    rafGapsOver32: gaps.filter((g) => g > 32).length,
    engineMs: round(engineMs), engineShare: round(engineMs / wall * 1000) / 1000,
    engineTasks: data.tasks.length, engineTaskMaxMs: round(Math.max(0, ...data.tasks.map((t) => t.ms))),
  };
}

async function measureGrid(browser, servers) {
  // Without the engine first: what the page alone costs on this machine.
  const plain = await openPage(browser, servers, '/perf/grid.html', { engine: false });
  await plain.page.waitForTimeout(1500);
  const baseline = await storm(plain.page);
  await plain.context.close();

  const { page, context } = await openPage(browser, servers, '/perf/grid.html', { engine: true });
  await page.waitForTimeout(1500); // remote sheets arrive and are applied
  const load = await page.evaluate(() => ({
    firstPaintMs: __sanPerf.frames[0] ?? 0,
    engineMsBeforeStorm: __sanPerf.tasks.reduce((s, t) => s + t.ms, 0),
    sheets: document.styleSheets.length,
    overrideBytes: document.querySelector('style[data-sunglasses-at-night="override"]')?.textContent.length ?? 0,
  }));
  const withEngine = await storm(page);
  // Every engine task since load (initial pass, sheet arrivals, storm) that
  // ended after the first frame.
  const after = await page.evaluate((limit) => {
    const late = __sanPerf.tasks.filter((t) => t.start + t.ms > __sanPerf.frames[0]);
    const longest = late.reduce((m, t) => (t.ms > m.ms ? t : m), { name: '-', ms: 0 });
    const ads = [...document.querySelectorAll('#recs .ad')];
    return {
      longest, over: late.filter((t) => t.ms > limit).length,
      adsStyled: ads.filter((a) => a.hasAttribute('data-san-inline')).length,
      ads: ads.length,
      cardBg: getComputedStyle(document.querySelector('.card')).backgroundColor,
    };
  }, BUDGET.longTaskMs);
  await context.close();
  return {
    cards: GRID.cards, sheets: load.sheets, rules: (GRID.siteSheets + GRID.cdnSheets) * GRID.rulesPerSheet,
    crossOriginSheets: GRID.cdnSheets, overrideBytes: load.overrideBytes,
    firstPaintMs: round(load.firstPaintMs), engineMsBeforeStorm: round(load.engineMsBeforeStorm),
    longestEngineTaskAfterFirstPaint: { name: after.longest.name, ms: round(after.longest.ms) },
    engineTasksOver50AfterFirstPaint: after.over,
    storm: withEngine, baselineStorm: baseline,
    check: { adsStyled: after.adsStyled, ads: after.ads, cardBackground: after.cardBg },
  };
}

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/** Run every measurement; returns the result written to OUT. */
export async function runPerf() {
  const servers = await startServers();
  const browser = await webkit.launch();
  try {
    const nodes = await measureNodes(browser, servers);
    const grid = await measureGrid(browser, servers);
    const budgets = {
      nodesInitialMedian: { value: nodes.initialMedianMs, max: BUDGET.initialMedianMs },
      nodesBatchMedian: { value: nodes.batchMedianMs, max: BUDGET.batchMedianMs },
      gridLongestEngineTaskAfterFirstPaint: { value: grid.longestEngineTaskAfterFirstPaint.ms, max: BUDGET.longTaskMs },
      gridStormEngineShare: { value: grid.storm.engineShare, max: BUDGET.stormShare },
      gridStormRafGapMax: { value: grid.storm.rafGapMaxMs, max: BUDGET.rafGapMs },
    };
    for (const b of Object.values(budgets)) b.pass = b.value <= b.max;
    const result = {
      task: 'T013', when: new Date().toISOString(), head: gitHead(),
      browser: `Playwright WebKit ${browser.version()} (headless), ${process.platform} ${process.arch}`,
      method: 'Engine time = sum of engine main-thread tasks reported by startDynamic opts.monitor. ' +
        'rAF gaps from a requestAnimationFrame recorder installed at document start. Content script runs in the page world here (Safari: isolated world).',
      budgets, pass: Object.values(budgets).every((b) => b.pass), nodes, grid,
    };
    mkdirSync(resolve(OUT, '..'), { recursive: true });
    writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
    return result;
  } finally {
    await browser.close();
    await servers.close();
  }
}

export function summary(r) {
  const lines = [`T013 perf (${r.browser}, HEAD ${r.head})`];
  for (const [k, b] of Object.entries(r.budgets)) lines.push(`${b.pass ? 'PASS' : 'FAIL'} ${k}: ${b.value} (max ${b.max})`);
  lines.push(`nodes initial ms: ${r.nodes.initialMs.join(', ')}; batch ms: ${r.nodes.batchMs.join(', ')}`);
  const s = r.grid.storm, b = r.grid.baselineStorm;
  lines.push(`grid storm: ${s.mutations} mutations in ${s.wallMs} ms, engine ${s.engineMs} ms (${(s.engineShare * 100).toFixed(1)}%), ` +
    `longest engine task ${s.engineTaskMaxMs} ms, rAF gap max ${s.rafGapMaxMs} / p99 ${s.rafGapP99Ms} ms (baseline without engine: max ${b.rafGapMaxMs} / p99 ${b.rafGapP99Ms} ms)`);
  lines.push(`grid load: engine ${r.grid.engineMsBeforeStorm} ms before storm, longest after first paint ${r.grid.longestEngineTaskAfterFirstPaint.name} ${r.grid.longestEngineTaskAfterFirstPaint.ms} ms; ` +
    `ads styled ${r.grid.check.adsStyled}/${r.grid.check.ads}; card bg ${r.grid.check.cardBackground}`);
  lines.push(`overall: ${r.pass ? 'PASS' : 'FAIL'} → ${OUT}`);
  return lines.join('\n');
}

if (process.argv[1] && basename(process.argv[1]) === 'perf.js') {
  runPerf().then((r) => {
    console.log(summary(r));
    process.exitCode = r.pass ? 0 : 1;
  }, (e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
