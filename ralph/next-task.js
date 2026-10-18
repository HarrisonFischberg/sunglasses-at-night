// Prints the next dependency-ready task from prd.md as JSON, or a status line.
// Exit codes: 0 = task printed, 10 = all tasks done, 11 = pending tasks but none ready.
import { readFileSync } from 'node:fs';

const prd = readFileSync(new URL('../prd.md', import.meta.url), 'utf8');
const rows = prd.split('\n')
  .filter((l) => /^\| T\d{3} \|/.test(l))
  .map((l) => {
    const c = l.split('|').slice(1, -1).map((s) => s.trim());
    return { id: c[0], task: c[1], deps: c[2], criteria: c[3], verify: c[4], status: c[5].toLowerCase() };
  });

const done = new Set(rows.filter((r) => r.status.startsWith('done')).map((r) => r.id));

function depIds(deps, self) {
  if (/\ball\b/i.test(deps)) return rows.map((r) => r.id).filter((id) => id !== self);
  const ids = new Set();
  for (const m of deps.matchAll(/T(\d{3})\s*[–-]\s*T(\d{3})/g)) {
    for (let n = +m[1]; n <= +m[2]; n++) ids.add('T' + String(n).padStart(3, '0'));
  }
  for (const m of deps.matchAll(/T\d{3}/g)) ids.add(m[0]);
  if (/data inventory final/i.test(deps)) ['T007', 'T011', 'T014'].forEach((id) => ids.add(id));
  return [...ids];
}

if (rows.length && rows.every((r) => r.status.startsWith('done'))) { console.log('ALL_DONE'); process.exit(10); }
const ready = rows.find((r) => r.status === 'pending' && depIds(r.deps, r.id).every((d) => done.has(d)));
if (!ready) { console.log('NONE_READY'); process.exit(11); }
console.log(JSON.stringify(ready));
