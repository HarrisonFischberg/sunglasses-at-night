// T013: the performance budget, run with the rest of the WebKit e2e suite so
// the runner's out-of-sandbox pass produces ralph/evidence/t013-perf.json.
// Same code as `npm run perf` (engine/scripts/perf.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPerf, summary } from '../engine/scripts/perf.js';

test('T013 perf budget: 5,000-node page and product-grid storm', { timeout: 240000 }, async () => {
  const r = await runPerf();
  console.log(summary(r));
  for (const [k, b] of Object.entries(r.budgets)) if (!b.advisory) assert.ok(b.pass, `${k}: ${b.value} > ${b.max}`);
  assert.equal(r.grid.check.adsStyled, r.grid.check.ads, 'every inserted ad got its inline colors rewritten');
});
