// Manifest helpers shared by the macOS and iOS runners.
import { readFileSync } from 'node:fs';
export function loadManifest(name = 'sites') {
  return JSON.parse(readFileSync(new URL(`../manifest/${name}.json`, import.meta.url), 'utf8'));
}
// set: smoke (3 pilot sites) | pilot (10) | p50 (50) | full (every row)
export function pickSites(m, { set, ids } = {}) {
  const byId = new Map(m.sites.map((s) => [s.id, s]));
  if (ids?.length) return ids.map((id) => byId.get(id) ?? { id, domain: id, url: id.startsWith('http') ? id : `https://${id}/`, category: 'adhoc', features: [], interactions: [], invariants: [], access: 'open', scrolls: 2 });
  if (set === 'fixtures') return m.sites;
  if (set === 'smoke') return m.sets.pilot.slice(0, 3).map((id) => byId.get(id));
  if (set === 'pilot' || set === 'p50') return m.sets[set].map((id) => byId.get(id));
  return m.sites;
}
