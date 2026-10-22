/* Shared state for the three Phase 3B concept previews (T026).
   One module, three visual worlds: every concept renders this same state, so
   the comparison is about design, not content. Static previews only: nothing
   here ships, talks to a network, or touches real settings. Classic script
   (window.ConceptState) so the pages also open from file://. */
(function () {
  'use strict';

  const MODES = [
    { value: 'system', label: 'Match system', hint: 'Dark when your device is dark.' },
    { value: 'always', label: 'Always', hint: 'Every page, day or night.' },
    { value: 'schedule', label: 'On a schedule', hint: 'Dark between two times you pick.' },
    { value: 'off', label: 'Off', hint: 'Pages look the way their authors made them.' },
  ];

  const RULES = [
    { value: 'default', label: 'Default' },
    { value: 'always', label: 'Always dark' },
    { value: 'never', label: 'Never dark' },
  ];

  const PRESETS = [
    { value: 'standard', label: 'Standard', look: { brightness: 100, contrast: 100, sepia: 0, grayscale: 0 } },
    { value: 'soft', label: 'Soft', look: { brightness: 90, contrast: 90, sepia: 0, grayscale: 0 } },
    { value: 'warm', label: 'Warm', look: { brightness: 95, contrast: 95, sepia: 30, grayscale: 0 } },
    { value: 'mono', label: 'Mono', look: { brightness: 95, contrast: 105, sepia: 0, grayscale: 100 } },
  ];

  const SLIDERS = [
    { key: 'brightness', label: 'Brightness', min: 50, max: 150 },
    { key: 'contrast', label: 'Contrast', min: 50, max: 150 },
    { key: 'sepia', label: 'Sepia', min: 0, max: 100 },
    { key: 'grayscale', label: 'Grayscale', min: 0, max: 100 },
  ];

  function initial() {
    return {
      mode: 'system',
      systemDark: true,
      schedule: { start: '21:00', end: '07:00' },
      look: { brightness: 100, contrast: 100, sepia: 0, grayscale: 0 },
      preset: 'standard',
      images: 'dim',
      hideBackgroundImages: false,
      detectDark: true,
      engine: 'dynamic',
      page: { host: 'longreads.example', restricted: false, looksDark: false },
      siteRule: 'default',
      sites: [
        { host: 'bank.example', rule: 'never' },
        { host: 'recipes.example', rule: 'always' },
      ],
    };
  }

  function presetFor(look) {
    const hit = PRESETS.find((p) => SLIDERS.every((s) => p.look[s.key] === look[s.key]));
    return hit ? hit.value : 'custom';
  }

  /** Whether the current page is dark right now, and why. */
  function decision(s) {
    if (s.page.restricted) return { on: false, reason: 'restricted' };
    if (s.siteRule === 'never') return { on: false, reason: 'never' };
    if (s.siteRule === 'always') return { on: true, reason: 'site-always' };
    if (s.mode === 'off') return { on: false, reason: 'off' };
    if (s.page.looksDark && s.detectDark) return { on: false, reason: 'already-dark' };
    if (s.mode === 'always') return { on: true, reason: 'always' };
    if (s.mode === 'schedule') return { on: true, reason: 'schedule' };
    return s.systemDark ? { on: true, reason: 'system' } : { on: false, reason: 'system-light' };
  }

  /** Popup status line. The only place wit lives; controls stay plain. */
  function status(s) {
    const d = decision(s);
    const host = s.page.host;
    switch (d.reason) {
      case 'restricted': return { on: false, headline: 'Nothing to darken here.', detail: 'Safari keeps this kind of page to itself.' };
      case 'never': return { on: false, headline: 'Skipping ' + host + '.', detail: 'You told it never to darken this site.' };
      case 'site-always': return { on: true, headline: 'Shades on.', detail: host + ' is always dark.' };
      case 'off': return { on: false, headline: 'Shades off.', detail: 'Pages show as their authors made them.' };
      case 'already-dark': return { on: false, headline: 'Already dark. Left alone.', detail: 'This page was dark before we got here.' };
      case 'always': return { on: true, headline: 'Shades on.', detail: 'Every page, until you say otherwise.' };
      case 'schedule': return { on: true, headline: 'Shades on.', detail: 'Dark from ' + s.schedule.start + ' to ' + s.schedule.end + '.' };
      case 'system': return { on: true, headline: 'Lights low.', detail: 'Dark because your device is in dark mode.' };
      default: return { on: false, headline: 'Daylight.', detail: 'Your device is in light mode, so pages stay as they are.' };
    }
  }

  function create(overrides) {
    let s = Object.assign(initial(), overrides || {});
    const subs = new Set();
    const api = {
      get: () => s,
      set(patch) {
        s = Object.assign({}, s, patch);
        if (patch.look) s.preset = presetFor(s.look);
        subs.forEach((f) => f(s));
      },
      setLook(key, value) {
        api.set({ look: Object.assign({}, s.look, { [key]: Number(value) }) });
      },
      setPreset(value) {
        const p = PRESETS.find((x) => x.value === value);
        if (p) api.set({ look: Object.assign({}, p.look), preset: value });
      },
      setSiteRule(rule) {
        const sites = s.sites.filter((x) => x.host !== s.page.host);
        if (rule !== 'default') sites.push({ host: s.page.host, rule: rule });
        api.set({ siteRule: rule, sites: sites });
      },
      removeSite(host) {
        api.set({ sites: s.sites.filter((x) => x.host !== host), siteRule: host === s.page.host ? 'default' : s.siteRule });
      },
      subscribe(f) { subs.add(f); f(s); return () => subs.delete(f); },
    };
    return api;
  }

  /** Query-string overrides so screenshots can pin a state: ?mode=off&rule=never&dark=0 */
  function fromQuery(search) {
    const q = new URLSearchParams(search);
    const o = {};
    if (q.has('mode')) o.mode = q.get('mode');
    if (q.has('dark')) o.systemDark = q.get('dark') !== '0';
    if (q.get('restricted') === '1') o.page = Object.assign({}, initial().page, { restricted: true, host: '' });
    if (q.get('alreadydark') === '1') o.page = Object.assign({}, initial().page, { looksDark: true });
    const st = create(o);
    if (q.has('rule')) st.setSiteRule(q.get('rule'));
    return st;
  }

  window.ConceptState = { MODES, RULES, PRESETS, SLIDERS, create, fromQuery, decision, status, presetFor };
})();
