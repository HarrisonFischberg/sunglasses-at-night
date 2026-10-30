// Package the Safari extension's web code for Chrome Web Store and Firefox Add-ons.
// Usage: node scripts/package-web.mjs  ->  dist/sunglasses-at-night-{chrome,firefox}-<version>.zip
import { cpSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const src = 'Extension/Resources';
const base = JSON.parse(readFileSync(`${src}/manifest.json`, 'utf8'));
// nativeMessaging only talks to the Safari container app; the code no-ops without it.
const permissions = base.permissions.filter((p) => p !== 'nativeMessaging');

const targets = {
  chrome: { ...base, permissions },
  firefox: {
    ...base,
    permissions,
    background: { scripts: [base.background.service_worker] },
    browser_specific_settings: {
      gecko: {
        id: 'sunglasses-at-night@rarecreatures.app',
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] },
      },
      gecko_android: { strict_min_version: '142.0' },
    },
  },
};

for (const [name, manifest] of Object.entries(targets)) {
  const out = `dist/${name}`;
  rmSync(out, { recursive: true, force: true });
  mkdirSync('dist', { recursive: true });
  cpSync(src, out, { recursive: true });
  writeFileSync(`${out}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  const zip = `sunglasses-at-night-${name}-${base.version}.zip`;
  rmSync(`dist/${zip}`, { force: true });
  execFileSync('zip', ['-qrX', `../${zip}`, '.', '-x', '.*'], { cwd: out });
  console.log(`dist/${zip}`);
}
