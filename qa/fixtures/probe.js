// Page-side probe for QA fixtures only (never injected into live sites).
// It observes and never changes the page: every animation frame for ~4 s it
// records the extension's <html> markers and the computed root/body colors,
// then audits media (effective filters/opacity/blend up the ancestor chain)
// and text (computed color vs resolved background, WCAG contrast), and
// beacons everything to the fixture server. Taps on [data-qa-click] are
// beaconed at once (functionality / click-blocking checks).
(function () {
  const q = new URLSearchParams(location.search);
  const run = q.get('run') || 'default';
  const samples = [];
  const extra = { clicks: [], cspViolations: 0, cspSamples: [] };
  // Inline styles blocked by the page's CSP (an engine that keeps recreating
  // blocked <style> elements shows up here as an ever-growing count).
  addEventListener('securitypolicyviolation', (e) => { extra.cspViolations++; if (extra.cspSamples.length < 5) extra.cspSamples.push(e.violatedDirective); }, true);
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const cr = (a, b) => (Math.max(L(a), L(b)) + 0.05) / (Math.min(L(a), L(b)) + 0.05);
  const read = () => {
    const h = document.documentElement, b = document.body;
    const rs = getComputedStyle(h), bs = b ? getComputedStyle(b) : null;
    // The composited page background: body if opaque, else root.
    const bb = parse(bs?.backgroundColor), rb = parse(rs.backgroundColor);
    const pageBg = bb && bb.a > 0.5 ? bb : rb && rb.a > 0.5 ? rb : { r: 255, g: 255, b: 255, a: 1 };
    return { t: Math.round(performance.now()), wall: Date.now(), off: h.hasAttribute('data-sunglasses-off'), ready: h.hasAttribute('data-sunglasses-ready'),
      early: !!document.getElementById('sunglasses-at-night-early'), ourSheets: document.querySelectorAll('style[data-sunglasses-at-night]').length,
      pageL: +L(pageBg).toFixed(3), rootBg: rs.backgroundColor, bodyBg: bs ? bs.backgroundColor : null,
      scheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' };
  };
  function bgOf(el) {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return c; }
    return parse(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  }
  function audit() {
    const media = [...document.querySelectorAll('[data-qa-media]')].map((el) => {
      const chain = []; let opacity = 1;
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
        const cs = getComputedStyle(e); opacity *= +cs.opacity;
        if (cs.filter !== 'none' || cs.mixBlendMode !== 'normal' || cs.backdropFilter && cs.backdropFilter !== 'none') chain.push({ tag: e.localName, filter: cs.filter, blend: cs.mixBlendMode, backdrop: cs.backdropFilter });
      }
      const r = el.getBoundingClientRect();
      return { id: el.dataset.qaMedia, opacity: +opacity.toFixed(3), effects: chain, rect: [r.x, r.y, r.width, r.height].map(Math.round), complete: el.complete ?? null };
    });
    const text = [...document.querySelectorAll('[data-qa-text]')].map((el) => {
      const cs = getComputedStyle(el); const fg0 = parse(cs.color); const bg = bgOf(el);
      // Effective text color: own alpha times ancestor opacity, over the resolved background.
      let op = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) op *= +getComputedStyle(e).opacity;
      const a = (fg0?.a ?? 1) * op;
      const fg = fg0 && { r: fg0.r * a + bg.r * (1 - a), g: fg0.g * a + bg.g * (1 - a), b: fg0.b * a + bg.b * (1 - a) };
      return { id: el.dataset.qaText, color: cs.color, opacity: +op.toFixed(2), bg: `rgb(${bg.r}, ${bg.g}, ${bg.b})`, contrast: fg ? +cr(fg, bg).toFixed(2) : null, size: cs.fontSize, weight: cs.fontWeight };
    });
    return { media, text };
  }
  addEventListener('click', (e) => {
    const t = e.target.closest?.('[data-qa-click]');
    extra.clicks.push({ id: t?.dataset.qaClick ?? null, target: e.target.localName, t: Math.round(performance.now()) });
    send('click');
  }, true);
  function send(phase) {
    const body = JSON.stringify({ run, page: location.pathname, search: location.search, phase, ua: navigator.userAgent, timeOrigin: performance.timeOrigin,
      viewport: [innerWidth, innerHeight, devicePixelRatio], samples, extra });
    try { if (navigator.sendBeacon(`/beacon?run=${encodeURIComponent(run)}`, body)) return; } catch {}
    fetch(`/beacon?run=${encodeURIComponent(run)}`, { method: 'POST', body, keepalive: true }).catch(() => {});
  }
  samples.push({ ...read(), phase: 'script' });
  let n = 0;
  const tick = () => { samples.push(read()); if (++n < 240) requestAnimationFrame(tick); else { extra.audit = audit(); send('done'); } };
  requestAnimationFrame(tick);
  addEventListener('DOMContentLoaded', () => { extra.dclAt = Math.round(performance.now()); });
  addEventListener('load', () => { extra.loadAt = Math.round(performance.now()); });
  window.__qa = { audit, send, samples, extra };
  // Re-audit on demand after interactions (SPA route change, toggle).
  window.__qaReaudit = () => { extra.audit = audit(); send('reaudit'); };
})();
