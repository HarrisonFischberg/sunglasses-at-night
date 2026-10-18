// Sunglasses at Night: settings model.
// Defaults, schema validation (reject or clamp), migration from the
// unversioned v0 layout to v1, and a thin wrapper over a WebExtension
// storage area. No DOM, no network. The storage area is injected so the
// same code runs in background.js, the popup, and node:test.

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'settings';

export const MODES = Object.freeze(['system', 'always', 'schedule', 'off']);
export const SITE_RULES = Object.freeze(['default', 'always', 'never']);
export const IMAGE_MODES = Object.freeze(['leave', 'dim', 'no-invert']);
export const ENGINES = Object.freeze(['dynamic', 'filter']);

// Slider ranges, in percent. 100 = identity for brightness/contrast, 0 for sepia/grayscale.
export const LOOK_RANGES = Object.freeze({
  brightness: Object.freeze({ min: 50, max: 150, default: 100 }),
  contrast: Object.freeze({ min: 50, max: 150, default: 100 }),
  sepia: Object.freeze({ min: 0, max: 100, default: 0 }),
  grayscale: Object.freeze({ min: 0, max: 100, default: 0 }),
});

// Upper bound on stored per-site entries, so a runaway caller can't fill the quota.
export const MAX_SITES = 5000;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const IPV6_RE = /^\[[0-9a-f:.]+\]$/;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function defaultLook() {
  const look = {};
  for (const [k, r] of Object.entries(LOOK_RANGES)) look[k] = r.default;
  return look;
}

export function defaultSettings() {
  return {
    version: SCHEMA_VERSION,
    mode: 'system',
    schedule: { start: '20:00', end: '07:00' },
    look: defaultLook(),
    images: 'leave',
    hideBackgroundImages: false,
    detectDark: true,
    engine: 'dynamic',
    sites: {},
  };
}

// ------------------------------------------------------------- primitives

// Returns a clamped integer percent, or undefined when `v` isn't a finite number.
function clampNumber(v, { min, max }) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  return Math.min(max, Math.max(min, Math.round(v)));
}

export function normalizeHostname(input) {
  if (typeof input !== 'string') return null;
  let host = input.trim().toLowerCase();
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (host.length === 0 || host.length > 253) return null;
  if (IPV6_RE.test(host)) return host;
  const labels = host.split('.');
  return labels.every((l) => LABEL_RE.test(l)) ? host : null;
}

export function isValidTime(v) {
  return typeof v === 'string' && TIME_RE.test(v);
}

export function timeToMinutes(v) {
  const m = TIME_RE.exec(v);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// ------------------------------------------------------------- validation

// Each normalizer takes untrusted input and returns a value that is always
// valid. Problems are pushed to `errors` as "path: reason" strings.

function normalizeEnum(v, allowed, fallback, path, errors) {
  if (v === undefined) return fallback;
  if (allowed.includes(v)) return v;
  errors.push(`${path}: rejected ${JSON.stringify(v)}`);
  return fallback;
}

function normalizeBool(v, fallback, path, errors) {
  if (v === undefined) return fallback;
  if (typeof v === 'boolean') return v;
  errors.push(`${path}: rejected ${JSON.stringify(v)}`);
  return fallback;
}

// `partial` = true keeps only the keys present (per-site overrides).
function normalizeLook(v, base, path, errors, partial = false) {
  const out = partial ? {} : { ...base };
  if (v === undefined) return out;
  if (!isPlainObject(v)) {
    errors.push(`${path}: rejected non-object`);
    return out;
  }
  for (const [k, range] of Object.entries(LOOK_RANGES)) {
    if (!own(v, k)) continue;
    const n = clampNumber(v[k], range);
    if (n === undefined) {
      errors.push(`${path}.${k}: rejected ${JSON.stringify(v[k])}`);
      continue;
    }
    if (n !== v[k]) errors.push(`${path}.${k}: clamped ${v[k]} to ${n}`);
    out[k] = n;
  }
  for (const k of Object.keys(v)) if (!own(LOOK_RANGES, k)) errors.push(`${path}.${k}: unknown key dropped`);
  return out;
}

function normalizeSchedule(v, base, path, errors) {
  const out = { ...base };
  if (v === undefined) return out;
  if (!isPlainObject(v)) {
    errors.push(`${path}: rejected non-object`);
    return out;
  }
  for (const k of ['start', 'end']) {
    if (!own(v, k)) continue;
    if (isValidTime(v[k])) out[k] = v[k];
    else errors.push(`${path}.${k}: rejected ${JSON.stringify(v[k])}`);
  }
  return out;
}

// A site entry keeps only fields that differ from "inherit global".
function normalizeSite(v, path, errors) {
  if (!isPlainObject(v)) {
    errors.push(`${path}: rejected non-object`);
    return null;
  }
  const site = { rule: normalizeEnum(v.rule, SITE_RULES, 'default', `${path}.rule`, errors) };
  if (v.look !== undefined) {
    const look = normalizeLook(v.look, null, `${path}.look`, errors, true);
    if (Object.keys(look).length) site.look = look;
  }
  if (v.engine !== undefined) {
    const engine = normalizeEnum(v.engine, ENGINES, undefined, `${path}.engine`, errors);
    if (engine) site.engine = engine;
  }
  if (v.detectDark !== undefined) {
    const d = normalizeBool(v.detectDark, undefined, `${path}.detectDark`, errors);
    if (d !== undefined) site.detectDark = d;
  }
  return site;
}

function isInheritOnly(site) {
  return site.rule === 'default' && Object.keys(site).length === 1;
}

function normalizeSites(v, path, errors) {
  const out = {};
  if (v === undefined) return out;
  if (!isPlainObject(v)) {
    errors.push(`${path}: rejected non-object`);
    return out;
  }
  let count = 0;
  for (const [rawHost, entry] of Object.entries(v)) {
    const host = normalizeHostname(rawHost);
    if (!host) {
      errors.push(`${path}: rejected hostname ${JSON.stringify(rawHost)}`);
      continue;
    }
    const site = normalizeSite(entry, `${path}[${host}]`, errors);
    if (!site || isInheritOnly(site)) continue;
    if (!own(out, host) && count >= MAX_SITES) {
      errors.push(`${path}: over ${MAX_SITES} entries, ${JSON.stringify(host)} dropped`);
      continue;
    }
    if (!own(out, host)) count++;
    out[host] = site;
  }
  return out;
}

const TOP_LEVEL_KEYS = new Set([
  'version', 'mode', 'schedule', 'look', 'images', 'hideBackgroundImages', 'detectDark', 'engine', 'sites',
]);

// Validate a v1-shaped object. Always returns complete, valid settings.
export function validateSettings(input) {
  const errors = [];
  const d = defaultSettings();
  if (!isPlainObject(input)) {
    if (input !== undefined) errors.push('settings: rejected non-object, using defaults');
    return { settings: d, errors };
  }
  for (const k of Object.keys(input)) if (!TOP_LEVEL_KEYS.has(k)) errors.push(`${k}: unknown key dropped`);
  const settings = {
    version: SCHEMA_VERSION,
    mode: normalizeEnum(input.mode, MODES, d.mode, 'mode', errors),
    schedule: normalizeSchedule(input.schedule, d.schedule, 'schedule', errors),
    look: normalizeLook(input.look, d.look, 'look', errors),
    images: normalizeEnum(input.images, IMAGE_MODES, d.images, 'images', errors),
    hideBackgroundImages: normalizeBool(input.hideBackgroundImages, d.hideBackgroundImages, 'hideBackgroundImages', errors),
    detectDark: normalizeBool(input.detectDark, d.detectDark, 'detectDark', errors),
    engine: normalizeEnum(input.engine, ENGINES, d.engine, 'engine', errors),
    sites: normalizeSites(input.sites, 'sites', errors),
  };
  return { settings, errors };
}

// -------------------------------------------------------------- migration

// v0 is the unversioned pre-release layout: no `version` key, `enabled`
// boolean instead of `mode`, look sliders at the top level, and `sites`
// mapping hostname → 'dark' | 'light'.
function migrateV0(v0) {
  const v1 = {};
  if (typeof v0.enabled === 'boolean') v1.mode = v0.enabled ? 'system' : 'off';
  const look = {};
  for (const k of Object.keys(LOOK_RANGES)) if (own(v0, k)) look[k] = v0[k];
  if (Object.keys(look).length) v1.look = look;
  for (const k of ['images', 'hideBackgroundImages', 'detectDark', 'engine']) if (own(v0, k)) v1[k] = v0[k];
  if (isPlainObject(v0.sites)) {
    const legacyRule = { dark: 'always', light: 'never' };
    v1.sites = Object.create(null);
    for (const [host, value] of Object.entries(v0.sites)) {
      v1.sites[host] = { rule: own(legacyRule, value) ? legacyRule[value] : value };
    }
  }
  return v1;
}

const MIGRATIONS = { 0: migrateV0 };

// Bring any stored value up to the current schema, then validate it.
// `migrated` is true when the result differs from what should be written back.
export function migrate(stored) {
  if (!isPlainObject(stored)) {
    const { settings, errors } = validateSettings(stored);
    return { settings, errors, migrated: stored !== undefined, fromVersion: null };
  }
  let version = own(stored, 'version') ? stored.version : 0;
  const errors = [];
  if (!Number.isInteger(version) || version < 0 || version > SCHEMA_VERSION) {
    errors.push(`version: unsupported ${JSON.stringify(stored.version)}, using defaults`);
    return { settings: defaultSettings(), errors, migrated: true, fromVersion: version };
  }
  const fromVersion = version;
  let data = stored;
  while (version < SCHEMA_VERSION) {
    data = MIGRATIONS[version](data);
    version++;
  }
  const result = validateSettings(data);
  errors.push(...result.errors);
  return { settings: result.settings, errors, migrated: fromVersion !== SCHEMA_VERSION || errors.length > 0, fromVersion };
}

// ----------------------------------------------------------- site helpers

// Effective look/engine/detectDark for one hostname, plus its rule.
export function resolveSite(settings, hostname) {
  const host = normalizeHostname(hostname);
  const site = (host && settings.sites[host]) || { rule: 'default' };
  return {
    rule: site.rule,
    look: { ...settings.look, ...site.look },
    engine: site.engine ?? settings.engine,
    detectDark: site.detectDark ?? settings.detectDark,
  };
}

// ---------------------------------------------------------- storage wrapper

// `area` is a WebExtension StorageArea (browser.storage.local) or anything
// with promise-returning get(key) / set(obj) / remove(key), and optionally
// an `onChanged` event with addListener/removeListener.
export function createSettingsStore(area, { key = STORAGE_KEY } = {}) {
  async function write(settings) {
    await area.set({ [key]: settings });
    return settings;
  }

  async function load() {
    const got = await area.get(key);
    const { settings, errors, migrated } = migrate(got?.[key]);
    if (migrated) await write(settings);
    return { settings, errors };
  }

  async function save(candidate) {
    const { settings, errors } = validateSettings(candidate);
    await write(settings);
    return { settings, errors };
  }

  // Shallow-merge top level; `look` and `schedule` merge one level deeper.
  async function update(patch) {
    const { settings: current } = await load();
    const next = { ...current, ...patch };
    if (isPlainObject(patch?.look)) next.look = { ...current.look, ...patch.look };
    if (isPlainObject(patch?.schedule)) next.schedule = { ...current.schedule, ...patch.schedule };
    return save(next);
  }

  // Set one site's entry. `null` (or an inherit-only entry) deletes it.
  async function setSite(hostname, entry) {
    const host = normalizeHostname(hostname);
    if (!host) return { settings: (await load()).settings, errors: [`sites: rejected hostname ${JSON.stringify(hostname)}`] };
    const { settings: current } = await load();
    const sites = { ...current.sites };
    if (entry === null) delete sites[host];
    else sites[host] = entry;
    return save({ ...current, sites });
  }

  async function reset() {
    return write(defaultSettings());
  }

  // Calls `listener(settings)` with validated settings when the key changes.
  function subscribe(listener) {
    const ev = area.onChanged;
    if (!ev?.addListener) return () => {};
    const handler = (changes) => {
      if (!changes || !own(changes, key)) return;
      listener(migrate(changes[key].newValue).settings);
    };
    ev.addListener(handler);
    return () => ev.removeListener(handler);
  }

  return { load, save, update, setSite, reset, subscribe };
}

// In-memory StorageArea for tests and previews. Values are deep-copied
// through JSON, the same as real extension storage.
export function createMemoryArea(initial = {}) {
  let data = JSON.parse(JSON.stringify(initial));
  const listeners = new Set();
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  return {
    async get(key) {
      if (key == null) return clone(data);
      const keys = Array.isArray(key) ? key : [key];
      const out = {};
      for (const k of keys) if (own(data, k)) out[k] = clone(data[k]);
      return out;
    },
    async set(obj) {
      const changes = {};
      for (const [k, v] of Object.entries(obj)) {
        changes[k] = { oldValue: clone(data[k]), newValue: clone(v) };
        data[k] = clone(v);
      }
      for (const l of listeners) l(changes, 'local');
    },
    async remove(key) {
      const keys = Array.isArray(key) ? key : [key];
      const changes = {};
      for (const k of keys) {
        if (!own(data, k)) continue;
        changes[k] = { oldValue: clone(data[k]), newValue: undefined };
        delete data[k];
      }
      for (const l of listeners) l(changes, 'local');
    },
    onChanged: {
      addListener: (l) => listeners.add(l),
      removeListener: (l) => listeners.delete(l),
    },
    _raw: () => clone(data),
  };
}
