#!/usr/bin/env node
// Markdown coverage tables from results.json files:
//   node qa/summarize.mjs build/qa/runs/<run>/<platform> [more platform folders]
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const CATS = ['flash', 'surface', 'media', 'text', 'function', 'restore'];
const ST = ['PASS', 'FAIL', 'NEEDS_REVIEW', 'BLOCKED', 'UNTESTED', 'NOT_APPLICABLE'];
for (const dir of process.argv.slice(2)) {
  const f = join(dir, 'results.json');
  if (!existsSync(f)) { console.log(`\n(no results in ${dir})`); continue; }
  const r = JSON.parse(readFileSync(f, 'utf8'));
  const sites = Object.values(r.sites).filter((s) => !s.id.startsWith('fx-') && !s.id.includes('~'));
  const domains = new Set(sites.map((s) => (s.id === 'amazon-fresh' ? 'amazon.com' : s.id)));
  const blocked = sites.filter((s) => s.blocked);
  const untested = sites.filter((s) => CATS.every((k) => s.status[k]?.status === 'UNTESTED'));
  const completed = sites.filter((s) => !s.blocked && !untested.includes(s));
  const completedDomains = new Set(completed.map((s) => (s.id === 'amazon-fresh' ? 'amazon.com' : s.id)));
  console.log(`\n### ${r.platform} (${dir.split('/').slice(-2).join('/')})\n`);
  console.log(`Rows attempted ${sites.length} (${domains.size} distinct domains); completed ${completed.length} (${completedDomains.size} distinct domains); blocked ${blocked.length}; harness could not finish ${untested.length}. Visually reviewed: ${sites.filter((s) => s.evidence === 'visually-reviewed').length}.\n`);
  console.log(`| Category | ${ST.join(' | ')} |\n| --- | ${ST.map(() => '---').join(' | ')} |`);
  for (const k of [...CATS, 'textDom', 'mediaDom', 'restoreDom']) {
    const c = Object.fromEntries(ST.map((s) => [s, 0]));
    let any = false;
    for (const s of sites) if (s.status[k]) { c[s.status[k].status]++; any = true; }
    if (any) console.log(`| ${k} | ${ST.map((s) => c[s]).join(' | ')} |`);
  }
  if (blocked.length) console.log(`\nBlocked: ${blocked.map((s) => `${s.id} (${s.blocked})`).join(', ')}`);
  if (untested.length) console.log(`\nNot finished by the harness: ${untested.map((s) => s.id).join(', ')}`);
}
