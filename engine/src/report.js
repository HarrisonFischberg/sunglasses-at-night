// Sunglasses at Night: "Report a problem" (T011). Builds a mailto: URL for a
// draft in the user's own Mail app. The extension sends nothing: the popup
// shows a plain link and the user presses Send in Mail, after reading and
// editing the draft. Fields: site hostname, extension version, system
// (user agent string) and settings. Only the current site's rule is included,
// never the other sites the user has set rules for. Pure; no network.

export const REPORT_ADDRESS = 'support@rarecreatures.app';
export const REPORT_SUBJECT = 'Sunglasses at Night: problem report';

export function reportSettings(settings, host) {
  const { sites = {}, ...rest } = settings ?? {};
  const out = { ...rest };
  const entry = host ? sites[host] : undefined;
  if (entry) out.thisSite = entry;
  out.otherSiteRules = Object.keys(sites).filter((h) => h !== host).length;
  return out;
}

export function buildReportBody({ host, version, system, settings }) {
  return [
    'What went wrong? (please describe, then press Send)',
    '',
    '',
    '--- Sent only if you press Send. You can edit or delete anything below. ---',
    `Site: ${host || '(none)'}`,
    `Version: ${version || '(unknown)'}`,
    `System: ${system || '(unknown)'}`,
    `Settings: ${JSON.stringify(reportSettings(settings, host))}`,
  ].join('\n');
}

export function buildReportUrl(info) {
  return `mailto:${REPORT_ADDRESS}?subject=${encodeURIComponent(REPORT_SUBJECT)}&body=${encodeURIComponent(buildReportBody(info))}`;
}
