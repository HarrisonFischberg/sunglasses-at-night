import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReportUrl, buildReportBody, reportSettings, REPORT_ADDRESS } from '../src/report.js';
import { defaultSettings } from '../src/settings.js';

const settings = {
  ...defaultSettings(),
  sites: { 'a.test': { rule: 'never' }, 'secret.example': { rule: 'always' } },
};
const info = { host: 'a.test', version: '0.1.0', system: 'Mozilla/5.0 (Macintosh)', settings };

function parse(url) {
  const m = /^mailto:([^?]+)\?subject=([^&]*)&body=(.*)$/s.exec(url);
  assert.ok(m, 'mailto:addr?subject=…&body=…');
  return { to: m[1], subject: decodeURIComponent(m[2]), body: decodeURIComponent(m[3]) };
}

test('report URL is a mailto: to the support address', () => {
  const u = parse(buildReportUrl(info));
  assert.equal(u.to, REPORT_ADDRESS);
  assert.match(u.subject, /Sunglasses for Safari/);
});

test('report body has exactly the fields: site, version, system, settings', () => {
  const { body } = parse(buildReportUrl(info));
  const fields = body.split('\n').filter((l) => /^[A-Za-z]+: /.test(l)).map((l) => l.split(':')[0]);
  assert.deepEqual(fields, ['Site', 'Version', 'System', 'Settings']);
  assert.match(body, /^Site: a\.test$/m);
  assert.match(body, /^Version: 0\.1\.0$/m);
  assert.match(body, /^System: Mozilla\/5\.0 \(Macintosh\)$/m);
  const json = JSON.parse(/^Settings: (.*)$/m.exec(body)[1]);
  assert.equal(json.mode, settings.mode);
  assert.deepEqual(json.thisSite, { rule: 'never' });
});

test('report body never names other sites the user has rules for', () => {
  const { body } = parse(buildReportUrl(info));
  assert.ok(!body.includes('secret.example'));
  assert.equal(JSON.parse(/^Settings: (.*)$/m.exec(body)[1]).otherSiteRules, 1);
});

test('special characters survive encoding; missing fields are labelled', () => {
  const body = buildReportBody({ host: 'x.test', settings: defaultSettings() });
  assert.match(body, /Version: \(unknown\)/);
  const u = parse(buildReportUrl({ host: 'a&b=c.test', version: '1', system: 'x y', settings }));
  assert.match(u.body, /Site: a&b=c\.test/);
  assert.equal(buildReportUrl(info).includes(' '), false);
});

test('restricted page: no host, still builds', () => {
  const body = buildReportBody({ host: null, version: '0.1.0', system: 's', settings });
  assert.match(body, /Site: \(none\)/);
  assert.equal(reportSettings(settings, null).otherSiteRules, 2);
});

test('nothing is transmitted: report.js has no network API and the popup uses a plain link', () => {
  const src = readFileSync(new URL('../src/report.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|window\.open|tabs\.create|location)\b/);
  const html = readFileSync(new URL('../../Extension/Resources/popup/popup.html', import.meta.url), 'utf8');
  assert.match(html, /<a id="report"/);
});
