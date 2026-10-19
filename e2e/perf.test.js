// T013: the performance budget, run with the rest of the WebKit e2e suite so
// the runner's out-of-sandbox pass produces ralph/evidence/t013-perf.json.
// Same code as `npm run perf` (engine/scripts/perf.js).
//
// Three full runs; each gating budget is judged on the MEDIAN of its three
// values (2026-10-19, Opus): a single run on a busy Mac swung
// nodesBatchMedian between 6.5 and 10.5 ms with no code change. The median of
// three is not best-of-three: two slow runs still fail.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { runPerf, summary } from '../engine/scripts/perf.js';

const RUNS = 3;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

test('T013 perf budget: 5,000-node page and product-grid storm', { timeout: 720000 }, async () => {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const r = await runPerf();
    console.log(`run ${i + 1}/${RUNS}\n${summary(r)}`);
    runs.push(r);
    assert.equal(r.grid.check.adsStyled, r.grid.check.ads, 'every inserted ad got its inline colors rewritten');
  }
  const verdict = {};
  for (const k of Object.keys(runs[0].budgets)) {
    const b0 = runs[0].budgets[k];
    const value = median(runs.map((r) => r.budgets[k].value));
    const max = median(runs.map((r) => r.budgets[k].max));
    verdict[k] = { value, max, values: runs.map((r) => r.budgets[k].value), advisory: !!b0.advisory, pass: value <= max };
  }
  writeFileSync(new URL('../ralph/evidence/t013-perf-median.json', import.meta.url), JSON.stringify({ when: new Date().toISOString(), runs: RUNS, verdict }, null, 2) + '\n');
  for (const [k, v] of Object.entries(verdict)) {
    console.log(`${v.pass ? 'PASS' : v.advisory ? 'ADVISORY-OVER' : 'FAIL'} median-of-${RUNS} ${k}: ${v.value} (max ${v.max}) values ${v.values.join('/')}`);
    if (!v.advisory) assert.ok(v.pass, `${k}: median ${v.value} > ${v.max} (runs ${v.values.join('/')})`);
  }
});
