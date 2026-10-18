import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { bundle, TARGETS } from '../scripts/bundle.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

test('bundles are up to date with engine/src', () => {
  for (const { entry, out } of TARGETS) {
    const fresh = bundle(resolve(ROOT, entry));
    assert.equal(readFileSync(resolve(ROOT, out), 'utf8'), fresh, `${out} is stale: run node engine/scripts/bundle.js`);
  }
});

test('bundles are classic scripts (no import/export) that compile', () => {
  for (const { out } of TARGETS) {
    const text = readFileSync(resolve(ROOT, out), 'utf8');
    assert.ok(!/^\s*(import|export)\b/m.test(text), `${out} has module syntax`);
    assert.doesNotThrow(() => new vm.Script(text, { filename: out }));
  }
});

test('the background bundle registers exactly its listeners and expects no other API', () => {
  const text = readFileSync(resolve(ROOT, 'Extension/Resources/background.js'), 'utf8');
  const listeners = {};
  const ev = (name) => ({ addListener: (fn) => { (listeners[name] ??= []).push(fn); } });
  const ctx = vm.createContext({
    browser: {
      runtime: { id: 'ext', onMessage: ev('message') },
      storage: { local: {}, onChanged: ev('storage') },
      tabs: { onRemoved: ev('removed'), onUpdated: ev('updated') },
      commands: { onCommand: ev('command') },
    },
    fetch: async () => { throw new Error('no network in tests'); },
    URL,
  });
  vm.runInContext(text, ctx);
  assert.deepEqual(Object.keys(listeners).sort(), ['command', 'message', 'removed', 'storage', 'updated']);
  for (const fns of Object.values(listeners)) assert.equal(fns.length, 1);
  assert.equal(listeners.message[0]({ type: 'unrelated' }, {}, () => {}), false);
});

test('manifest declares the toolbar action and the toggle shortcut the background handles', async () => {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'Extension/Resources/manifest.json'), 'utf8'));
  const { TOGGLE_COMMAND } = await import('../src/background-core.js');
  assert.ok(manifest.action, 'manifest.action missing');
  assert.ok(manifest.commands?.[TOGGLE_COMMAND]?.suggested_key?.mac, 'Mac shortcut missing');
  // Exactly the prd.md architecture set: storage, plus nativeMessaging for the T014 App Group bridge.
  assert.deepEqual(manifest.permissions, ['storage', 'nativeMessaging'], 'only the PRD-approved permissions');
});

test('network APIs appear only in the background sheet fetcher', () => {
  const content = readFileSync(resolve(ROOT, 'Extension/Resources/content/engine.js'), 'utf8');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/.test(content.replace(/fetchSheet\w*\s*\(/g, '')),
    'content script must not make network requests');
  const bg = readFileSync(resolve(ROOT, 'Extension/Resources/background.js'), 'utf8');
  assert.ok(!/XMLHttpRequest|WebSocket|EventSource|sendBeacon/.test(bg));
});

test('bundler rejects module forms it does not support', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(resolve(process.env.TMPDIR ?? tmpdir(), 'san-bundle-'));
  writeFileSync(resolve(dir, 'a.js'), "export default 1;\n");
  assert.throws(() => bundle(resolve(dir, 'a.js')), /unsupported/);
  writeFileSync(resolve(dir, 'b.js'), "import * as x from './a.js';\n");
  assert.throws(() => bundle(resolve(dir, 'b.js')), /unsupported/);
});
