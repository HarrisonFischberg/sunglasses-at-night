// DOM audit run inside the page by the macOS runner (Safari "do JavaScript").
// Read-only: it inspects computed styles and never changes the page. Returns
// a JSON string. Exported as source text so it can be sent over AppleScript.
export const AUDIT_JS = String.raw`(() => {
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const blend = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const vw = innerWidth, vh = innerHeight;
  const visible = (r) => r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
  function background(el) {
    const stack = []; let overImage = false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && /url\(/.test(cs.backgroundImage)) overImage = true;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 0.99) break; }
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    const root = parse(getComputedStyle(document.documentElement).backgroundColor);
    if (root && root.a > 0.99) bg = root;
    for (let i = stack.length - 1; i >= 0; i--) bg = blend(stack[i], bg);
    return { bg, overImage };
  }
  const html = document.documentElement;
  const out = { url: location.href, title: document.title, readyState: document.readyState, viewport: [vw, vh, devicePixelRatio], outer: [outerWidth, outerHeight], scrollY,
    markers: { off: html.hasAttribute('data-sunglasses-off'), ready: html.hasAttribute('data-sunglasses-ready'), ourStyles: document.querySelectorAll('style[data-sunglasses-at-night]').length },
    scheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', resources: performance.getEntriesByType('resource').length };
  // Residue: anything the extension marks on elements.
  let residue = 0; for (const el of document.querySelectorAll('*')) { for (const a of el.attributes) if (a.name.startsWith('data-sunglasses') && !(el === html && a.name === 'data-sunglasses-off')) { residue++; break; } }
  out.residue = residue;
  const pageBg = background(document.body || html).bg; out.pageL = +L(pageBg).toFixed(3);
  // Text: leaf-ish elements with own text in the viewport.
  const texts = []; const walker = document.createTreeWalker(document.body || html, NodeFilter.SHOW_TEXT);
  const seen = new Set(); let n;
  while ((n = walker.nextNode()) && texts.length < 250) {
    if (!n.nodeValue.trim()) continue; const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    const r = el.getBoundingClientRect(); if (!visible(r)) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const { bg, overImage } = background(el); const f = blend(fg, bg);
    const c = (Math.max(L(f), L(bg)) + 0.05) / (Math.min(L(f), L(bg)) + 0.05);
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
    texts.push({ tag: el.localName, s: n.nodeValue.trim().slice(0, 40), c: +c.toFixed(2), large: size >= 24 || (size >= 18.66 && bold), overImage, link: !!el.closest('a'),
      r: [r.x, r.y, r.width, r.height].map(Math.round), fg: cs.color, bg: 'rgb(' + [bg.r, bg.g, bg.b].map(Math.round).join(',') + ')' });
  }
  out.texts = texts;
  // Media: img/video/canvas/svg/picture and url() backgrounds in the viewport.
  const media = [];
  for (const el of document.querySelectorAll('img,video,canvas,svg,picture,[style*="url("]')) {
    if (media.length >= 120) break; if (el.closest('svg') && el.localName !== 'svg') continue;
    const r = el.getBoundingClientRect(); if (!visible(r) || r.width * r.height < 900) continue;
    const effects = []; let opacity = 1;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); opacity *= +cs.opacity;
      if (cs.filter !== 'none' || cs.mixBlendMode !== 'normal') effects.push([e.localName, cs.filter, cs.mixBlendMode]); }
    media.push({ tag: el.localName, r: [r.x, r.y, r.width, r.height].map(Math.round), opacity: +opacity.toFixed(3), effects, src: (el.currentSrc || el.src || '').slice(0, 120) });
  }
  out.media = media;
  out.counts = { links: document.links.length, buttons: document.querySelectorAll('button,[role=button]').length, inputs: document.querySelectorAll('input,select,textarea').length };
  const inp = [...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter((e) => visible(e.getBoundingClientRect())).slice(0, 20).map((e) => { const cs = getComputedStyle(e); const b = parse(cs.backgroundColor); return { bgL: b ? +L(b).toFixed(3) : null, color: cs.color, bg: cs.backgroundColor }; });
  out.inputs = inp;
  return JSON.stringify(out);
})()`;
