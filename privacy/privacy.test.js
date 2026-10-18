// Privacy verification (T019). Static checks that fail on any new network API,
// manifest permission, entitlement, StoreKit use or dependency. Each allowlist
// below is deliberately tiny: widening one is a privacy decision that needs
// docs/data-inventory.md updated and owner approval, not a test edit.
// Run: npm run privacy-check. No dependencies, no network (except npm audit,
// which asks the registry about our own package-lock.json and sends no app data).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function walk(dir, exts, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) walk(rel, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(rel);
  }
  return out;
}

/** Remove comments and string-free noise so a mention in prose isn't a hit. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

function scan(files, patterns, allow = {}) {
  const hits = [];
  for (const file of files) {
    const lines = stripComments(read(file)).split('\n');
    lines.forEach((line, i) => {
      for (const [name, re] of Object.entries(patterns)) {
        if (re.test(line) && !(allow[file] ?? []).includes(name)) {
          hits.push(`${file}:${i + 1} ${name}: ${line.trim()}`);
        }
      }
    });
  }
  return hits;
}

// ---- network APIs in shipped JavaScript --------------------------------------

const JS_NETWORK = {
  // Not preceded/followed by word chars, '/' or '-': message-type strings like
  // 'sunglasses-at-night/fetch-sheet' are names, not calls.
  fetch: /(?<![\w/-])fetch(?![\w-])/,
  XMLHttpRequest: /\bXMLHttpRequest\b/,
  WebSocket: /\bWebSocket\b/,
  EventSource: /\bEventSource\b/,
  sendBeacon: /\bsendBeacon\b/,
  WebTransport: /\bWebTransport\b/,
  RTCPeerConnection: /\bRTCPeerConnection\b/,
  importScripts: /\bimportScripts\b/,
  'dynamic import()': /\bimport\s*\(/,
  'window.open': /\bwindow\.open\b/,
  'tabs.create': /\btabs\.create\b/,
  'tabs.update': /\btabs\.update\b/,
  'runtime.connectNative': /\bconnectNative\b/,
  // XML namespace URIs (w3.org 1999/2000) are identifiers, never requested.
  'http(s) literal URL': /['"`]https?:\/\/(?!www\.w3\.org\/(?:1999|2000)\/)/,
};

// T007: the only network call is the same-origin stylesheet re-fetch. The
// `fetch` identifier may appear only in the module that implements it and the
// background entry that hands it the platform fetch. No file may name a URL.
const JS_ALLOW = {
  'engine/src/sheet-fetch.js': ['fetch'],
  'engine/src/background.js': ['fetch'],
  'engine/src/background-core.js': ['fetch'],
  'Extension/Resources/background.js': ['fetch'],
};

const SHIPPED_JS_SOURCES = [
  ...walk('engine/src', ['.js']),
  ...walk('Extension/Resources', ['.js']),
];

test('shipped JS: no network API except the T007 same-origin stylesheet re-fetch', () => {
  const hits = scan(SHIPPED_JS_SOURCES, JS_NETWORK, JS_ALLOW);
  assert.deepEqual(hits, [], `new network API in shipped JS:\n${hits.join('\n')}`);
});

test('shipped JS: the allowed fetch is the one in sheet-fetch.js with no credentials, no referrer', () => {
  const src = stripComments(read('engine/src/sheet-fetch.js'));
  assert.equal((src.match(/\bfetch\(/g) ?? []).length, 1, 'exactly one fetch call');
  assert.match(src, /credentials:\s*'omit'/);
  assert.match(src, /referrerPolicy:\s*'no-referrer'/);
  assert.match(src, /method:\s*'GET'/);
  assert.match(src, /u\.protocol !== 'https:' && u\.protocol !== 'http:'/);
});

test('shipped JS: no other file calls fetch( directly', () => {
  const callers = SHIPPED_JS_SOURCES.filter((f) => /\bfetch\(/.test(stripComments(read(f))));
  const allowed = new Set(['engine/src/sheet-fetch.js', 'Extension/Resources/background.js']);
  assert.deepEqual(callers.filter((f) => !allowed.has(f)), []);
});

// ---- network-capable markup --------------------------------------------------

test('extension pages load nothing from the network', () => {
  const remote = /(?:src|href|action|srcset|poster|data)\s*=\s*["']\s*(?:https?:)?\/\//i;
  const cssRemote = /(?:url\(\s*["']?|@import\s+["']?)(?:https?:)?\/\//i;
  const hits = [];
  for (const f of walk('Extension/Resources', ['.html', '.css'])) {
    read(f).split('\n').forEach((line, i) => {
      if (remote.test(line) || cssRemote.test(line)) hits.push(`${f}:${i + 1} ${line.trim()}`);
    });
  }
  assert.deepEqual(hits, []);
});

// ---- manifest ----------------------------------------------------------------

const manifest = () => JSON.parse(read('Extension/Resources/manifest.json'));

test('manifest: permission allowlist is exactly storage + nativeMessaging', () => {
  const m = manifest();
  assert.deepEqual([...m.permissions].sort(), ['nativeMessaging', 'storage']);
});

test('manifest: host permissions are only <all_urls> (needed to darken every site)', () => {
  assert.deepEqual(manifest().host_permissions, ['<all_urls>']);
});

test('manifest: no optional permissions, remote-reachable surfaces or relaxed CSP', () => {
  const m = manifest();
  const allowedKeys = [
    'manifest_version', 'name', 'description', 'version', 'permissions', 'host_permissions',
    'background', 'action', 'options_ui', 'commands', 'content_scripts', 'icons',
  ];
  const extra = Object.keys(m).filter((k) => !allowedKeys.includes(k));
  assert.deepEqual(extra, [], `unexpected manifest keys: ${extra.join(', ')}`);
  assert.equal(m.manifest_version, 3);
  for (const forbidden of [
    'optional_permissions', 'optional_host_permissions', 'externally_connectable',
    'web_accessible_resources', 'content_security_policy', 'declarative_net_request',
    'chrome_url_overrides', 'devtools_page', 'update_url',
  ]) assert.ok(!(forbidden in m), `${forbidden} must not be present`);
});

test('manifest: every content script and background script is a local file', () => {
  const m = manifest();
  const refs = [
    m.background?.service_worker, m.background?.page, ...(m.background?.scripts ?? []),
    m.action?.default_popup, m.options_ui?.page,
    ...m.content_scripts.flatMap((c) => c.js ?? []),
  ].filter(Boolean);
  for (const r of refs) assert.doesNotMatch(r, /^(?:[a-z]+:)?\/\//i, `${r} must be a relative file`);
});

// ---- Swift: no network, no StoreKit ------------------------------------------

const SWIFT_FILES = [
  ...walk('App', ['.swift']),
  ...walk('Extension', ['.swift']),
  ...walk('Shared', ['.swift']),
];

const SWIFT_FORBIDDEN = {
  URLSession: /\bURLSession\b/,
  URLRequest: /\bURLRequest\b/,
  URLSessionConfiguration: /\bURLSessionConfiguration\b/,
  'import Network': /^\s*import\s+Network\b/,
  NWConnection: /\bNW(?:Connection|Listener|PathMonitor)\b/,
  CFNetwork: /\bCFNetwork\b|\bCFReadStream|\bCFHTTP/,
  'import StoreKit': /^\s*import\s+StoreKit\b/,
  StoreKit: /\bStoreKit\b|\bSKPayment|\bSKProduct|\bSKStore|\bProduct\.products\b|\bTransaction\.updates\b|\bAppStore\.(?:sync|requestReview)/,
  'contents of remote URL': /\b(?:Data|String|NSData|NSString)\s*\(\s*contentsOf:/,
  WKWebView: /\bWKWebView\b|\bWebKit\b/,
  'ad / analytics SDK': /\b(?:AdSupport|ASIdentifierManager|AppTrackingTransparency|ATTrackingManager|FirebaseAnalytics|Crashlytics|Sentry|Mixpanel|Amplitude)\b/,
  'raw sockets': /\b(?:socket|getaddrinfo|CFSocket|NSStream)\s*\(/,
  'URL download APIs': /\b(?:downloadTask|dataTask|uploadTask|webSocketTask)\b/,
};

test('Swift sources: no URLSession / URLRequest / Network / StoreKit / web views / SDKs', () => {
  assert.ok(SWIFT_FILES.length >= 4, 'expected Swift sources to scan');
  const hits = scan(SWIFT_FILES, SWIFT_FORBIDDEN);
  assert.deepEqual(hits, [], `forbidden Swift API:\n${hits.join('\n')}`);
});

test('Swift tests may not make the shipped targets network-capable either', () => {
  const hits = scan(walk('Tests', ['.swift']), {
    URLSession: SWIFT_FORBIDDEN.URLSession,
    StoreKit: SWIFT_FORBIDDEN.StoreKit,
  });
  assert.deepEqual(hits, []);
});

// ---- project + entitlements --------------------------------------------------

test('Xcode project links no StoreKit, Network, AdSupport or tracking framework', () => {
  const pbx = read('SunglassesAtNight.xcodeproj/project.pbxproj');
  for (const fw of [
    'StoreKit', 'Network.framework', 'AdSupport', 'AppTrackingTransparency',
    'iAd', 'AdServices', 'CloudKit', 'NetworkExtension', 'CFNetwork',
  ]) assert.ok(!pbx.includes(fw), `${fw} must not be referenced by the project`);
  assert.ok(!/Swift\s*Package|XCRemoteSwiftPackageReference/i.test(pbx), 'no Swift package dependencies');
  assert.ok(!/Pods|Carthage/.test(pbx), 'no CocoaPods or Carthage');
});

const ENTITLEMENTS = [
  'Config/App-iOS.entitlements',
  'Config/App-macOS.entitlements',
  'Config/Extension-iOS.entitlements',
  'Config/Extension-macOS.entitlements',
];
const ALLOWED_ENTITLEMENT_KEYS = ['com.apple.security.app-sandbox', 'com.apple.security.application-groups'];

test('entitlements: only the sandbox and the App Group; no network, files, devices or iCloud', () => {
  for (const f of ENTITLEMENTS) {
    const keys = [...read(f).matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1]);
    const extra = keys.filter((k) => !ALLOWED_ENTITLEMENT_KEYS.includes(k));
    assert.deepEqual(extra, [], `${f}: unexpected entitlement(s) ${extra.join(', ')}`);
    assert.ok(!/network\.(client|server)/.test(read(f)), `${f}: no network entitlements`);
  }
  for (const f of ENTITLEMENTS.filter((x) => x.includes('macOS'))) {
    assert.match(read(f), /<key>com\.apple\.security\.app-sandbox<\/key>\s*<true\/>/, `${f}: sandbox on`);
  }
});

test('Info.plist: no App Transport Security exceptions, no background modes, no tracking keys', () => {
  const plist = read('Config/Extension-Info.plist');
  for (const key of ['NSAppTransportSecurity', 'NSAllowsArbitraryLoads', 'UIBackgroundModes', 'NSUserTrackingUsageDescription', 'SKAdNetworkItems']) {
    assert.ok(!plist.includes(key), `${key} must not be in Extension-Info.plist`);
  }
});

// ---- dependencies ------------------------------------------------------------

test('package.json: zero runtime dependencies; dev dependencies are the approved list only', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const k of ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies']) {
    assert.ok(!(k in pkg), `${k} must not be present`);
  }
  assert.deepEqual(pkg.devDependencies, { playwright: '1.64.1' });
  for (const hook of ['preinstall', 'install', 'postinstall']) {
    assert.ok(!(pkg.scripts ?? {})[hook], `${hook} script must not exist`);
  }
});

test('package-lock.json: dev-only dependency tree (nothing shipped)', () => {
  const lock = JSON.parse(read('package-lock.json'));
  const prod = Object.entries(lock.packages ?? {}).filter(([k, v]) => k && !v.dev && !v.devOptional);
  assert.deepEqual(prod.map(([k]) => k), [], 'every locked package must be dev-only');
});

// The audit endpoint needs the npm registry. If it can't be reached the test
// FAILS: an audit that didn't run is not a pass.
test('npm audit: no known vulnerabilities in the lockfile', () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^npm_config_/i.test(k)));
  const r = spawnSync('npm', ['audit', '--json', '--audit-level=low'], { cwd: ROOT, encoding: 'utf8', env });
  let report;
  try { report = JSON.parse(r.stdout); } catch { report = null; }
  assert.ok(report && !report.error && !report.message, `npm audit could not run (needs registry.npmjs.org): ${r.stdout || r.stderr}`);
  const v = report.metadata?.vulnerabilities ?? {};
  const total = ['info', 'low', 'moderate', 'high', 'critical'].reduce((n, k) => n + (v[k] ?? 0), 0);
  assert.equal(total, 0, `npm audit found vulnerabilities: ${JSON.stringify(v)}`);
});

// ---- the checker itself ------------------------------------------------------

test('self-check: the scanner catches a planted network call and permission', () => {
  const planted = 'const r = await fetch("https://x.example/");\nnew WebSocket(u);\nXMLHttpRequest;';
  const fake = stripComments(planted).split('\n');
  const found = Object.entries(JS_NETWORK).filter(([, re]) => fake.some((l) => re.test(l))).map(([n]) => n);
  assert.deepEqual(found.sort(), ['WebSocket', 'XMLHttpRequest', 'fetch', 'http(s) literal URL']);
  assert.ok(SWIFT_FORBIDDEN.URLSession.test('let s = URLSession.shared'));
  assert.ok(SWIFT_FORBIDDEN['import StoreKit'].test('import StoreKit'));
  assert.equal(stripComments('// fetch( is documented here\nlet a = 1;').trim(), '\nlet a = 1;'.trim());
  assert.ok(relative(ROOT, join(ROOT, 'privacy')) === 'privacy');
});
