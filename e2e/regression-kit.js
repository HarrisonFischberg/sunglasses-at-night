// Shared helpers for the regression suite (e2e/regression-*.test.js):
// where its artifacts go, screenshots with diffs, and a JSON log per test.
// Artifacts: e2e/regression-out/<browser>-<os>-<viewport>/ (git-ignored), or
// $REGRESSION_OUT. Nothing here approves a baseline.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';
import { diffPng } from './png.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const BROWSER = process.env.E2E_BROWSER === 'chromium' ? 'chromium' : 'webkit';
export const VIEWPORT = '1024x900'; // harness.js preparePage
export const OUT = resolve(process.env.REGRESSION_OUT ?? resolve(ROOT, 'e2e/regression-out'), `${BROWSER}-${platform()}-${VIEWPORT}`);

export function artifact(name, data) {
  const file = resolve(OUT, name);
  mkdirSync(resolve(file, '..'), { recursive: true });
  writeFileSync(file, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2));
  return file;
}

/** Changed entries between two page-audit styles() maps. */
export function styleChanges(before, after) {
  const out = [];
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[k], b = after[k];
    if (!a || !b) { out.push({ el: k, change: a ? 'gone' : 'new' }); continue; }
    for (const p of Object.keys(a)) if (a[p] !== b[p]) out.push({ el: k, prop: p, before: a[p], after: b[p] });
  }
  return out;
}

/**
 * Pixels changed between two screenshots outside `masks`; writes
 * <name>-before.png, -after.png and -diff.png.
 */
export function compareShots(name, before, after, masks = []) {
  const { changed, png } = diffPng(before, after, masks);
  artifact(`${name}-before.png`, before);
  artifact(`${name}-after.png`, after);
  if (png) artifact(`${name}-diff.png`, png);
  return changed;
}
