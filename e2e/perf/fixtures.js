// T013 perf fixtures, generated (deterministic, seeded) so the page sizes
// the budget names are exact: a 5,000-element page, and a busy store search
// page modeled on the shape of large shopping sites (owner report: product
// grids get laggy). All markup, names and art here are our own.
//
// route(pathname, urls) → { type, body } | null serves both pages, their
// stylesheets (some from the site origin, some from the "cdn" origin so the
// CSSOM can't read them and the engine has to re-fetch) and the product art.

const CSS = 'text/css; charset=utf-8';
const HTML = 'text/html; charset=utf-8';
const SVG = 'image/svg+xml';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, list) => list[Math.floor(r() * list.length)];
const hex = (r, lo = 0, hi = 255) =>
  '#' + [0, 1, 2].map(() => Math.floor(lo + r() * (hi - lo)).toString(16).padStart(2, '0')).join('');

// Light-theme palette, the kind of colors a store page declares many times.
const LIGHTS = ['#ffffff', '#f7f7f7', '#fafafa', '#f0f2f2', '#eaeded', '#fff8e7', '#fef3f2', '#eef6ff', '#f5faf3'];
const DARKS = ['#0f1111', '#111111', '#222222', '#333333', '#565959', '#2b2b2b', '#1a1a2e'];
const ACCENTS = ['#c7511f', '#b12704', '#007185', '#067d62', '#cc0c39', '#e47911', '#565959', '#2162a1', '#7b4fd6'];
const BORDERS = ['#d5d9d9', '#dddddd', '#e7e7e7', '#cccccc', '#bbbfbf', '#a2a6ac'];

// Selectors that match real elements on the grid page, plus many that match
// nothing (real sites ship far more rules than one page uses).
const LIVE = [
  'body', 'header.top', '.top .search', '.top .search input', '.nav a', '.nav a:hover', '.side', '.side h3',
  '.side label', '.side .facet', '.results-bar', '.grid', '.card', '.card:hover', '.card .media', '.card img',
  '.card .badge', '.card .badge.deal', '.card .sponsored', '.card h2', '.card h2 a', '.card h2 a:visited',
  '.card .stars', '.card .star', '.card .star.on', '.card .count', '.card .price', '.card .price .sym',
  '.card .price .frac', '.card .was', '.card .ship', '.card .add', '.card .add:hover', '.card.seen',
  '.card.hot', '.card.hot .badge', '.recs', '.recs .ad', '.recs .ad .tag', '.recs .ad p', '.carousel',
  '.carousel .track', '.carousel .slide', '.carousel .slide h4', '.carousel .inner', '.carousel .thumb',
  '.carousel button', 'footer.bottom', 'footer.bottom a', '[aria-busy="true"]', '.pill', '.pill.on',
];

function decls(r) {
  const out = [];
  const n = 1 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    switch (Math.floor(r() * 10)) {
      case 0: case 1: out.push(`color:${pick(r, DARKS)}`); break;
      case 2: case 3: out.push(`background-color:${pick(r, LIGHTS)}`); break;
      case 4: out.push(`border:1px solid ${pick(r, BORDERS)}`); break;
      case 5: out.push(`color:${pick(r, ACCENTS)}`); break;
      case 6: out.push(`background:linear-gradient(to bottom, ${pick(r, LIGHTS)}, ${pick(r, LIGHTS)})`); break;
      case 7: out.push(`box-shadow:0 2px 5px rgba(15,17,17,.15)`); break;
      case 8: out.push(`padding:${Math.floor(r() * 16)}px`); break;
      default: out.push(`border-bottom-color:${hex(r, 180, 240)}`);
    }
  }
  return out.join(';');
}

/** One generated stylesheet: `count` rules, seeded by `seed`. */
export function sheet(seed, count) {
  const r = rng(seed);
  const rules = [`:root{--accent-${seed}:${pick(r, ACCENTS)};--surface-${seed}:${pick(r, LIGHTS)};--ink-${seed}:${pick(r, DARKS)}}`];
  for (let i = 1; i < count; i++) {
    const live = r() < 0.12;
    const sel = live ? pick(r, LIVE) : `.m${seed}-${i}${r() < 0.4 ? ` .e${Math.floor(r() * 40)}` : ''}`;
    let body = decls(r);
    if (r() < 0.06) body += `;color:var(--ink-${seed})`;
    if (r() < 0.04) body += `;background-color:var(--surface-${seed}, #fff)`;
    const rule = `${sel}{${body}}`;
    rules.push(r() < 0.08 ? `@media (min-width:${600 + Math.floor(r() * 800)}px){${rule}}` : rule);
  }
  return rules.join('\n');
}

// ------------------------------------------------------------- 5,000 nodes

export const NODES = { sections: 250, perSection: 20, sheets: 3, rulesPerSheet: 340 };

function nodesPage() {
  const r = rng(5000);
  const parts = [];
  for (let s = 0; s < NODES.sections; s++) {
    // 20 elements per section: section, h3, p, ul, 6 li, 6 span, div, a, em, b
    const bg = s % 10 === 0 ? ` style="background-color:${pick(r, LIGHTS)}"` : '';
    const lis = Array.from({ length: 6 }, (_, i) =>
      `<li class="e${(s + i) % 40}"><span${i === 2 ? ` style="color:${pick(r, ACCENTS)}"` : ''}>Item ${s}.${i}</span></li>`).join('');
    parts.push(
      `<section class="m1-${s % 300} sec"${bg}><h3>Section ${s}</h3>` +
      `<p>Plain words for section ${s}, <a href="#s${s}">a link</a>, <em>emphasis</em> and <b>bold</b>.</p>` +
      `<ul>${lis}</ul><div class="e${s % 40}">Footer ${s}</div></section>`,
    );
  }
  const links = Array.from({ length: NODES.sheets }, (_, i) => `<link rel="stylesheet" href="/perf/nodes-${i}.css">`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>5,000 nodes</title>${links}</head>
<body><main id="main">${parts.join('\n')}</main>
<script>
// One mutation batch: 25 inserts (inline colors, text) + 25 class flips.
let batchNo = 0;
globalThis.__batch = () => {
  const main = document.getElementById('main');
  const secs = main.children;
  batchNo++;
  for (let i = 0; i < 25; i++) {
    const p = document.createElement('p');
    p.className = 'e' + (i % 40);
    p.setAttribute('style', i % 3 ? 'color:#333333' : 'background-color:#fafafa;color:#565959');
    p.textContent = 'Inserted ' + batchNo + '.' + i;
    secs[(batchNo * 37 + i * 11) % secs.length].appendChild(p);
  }
  for (let i = 0; i < 25; i++) secs[(batchNo * 53 + i * 7) % secs.length].classList.toggle('flip');
};
</script></body></html>`;
}

// ------------------------------------------------------- product grid page

export const GRID = {
  cards: 60, siteSheets: 6, cdnSheets: 10, rulesPerSheet: 312, carousels: 3, slides: 12, thumbs: 4,
  stormMs: 5000, stormRate: 200, scrollSteps: 20, scrollPx: 600, scrollEveryMs: 250,
};

const NAMES = ['Kettle base', 'Pour-over stand', 'Ceramic mug pair', 'Tea tin', 'Milk frother', 'Burr grinder',
  'Glass carafe', 'Scale with timer', 'Travel tumbler', 'Filter papers', 'Bamboo tray', 'Gooseneck pot'];
const ADJ = ['Matte', 'Brushed', 'Compact', 'Classic', 'Studio', 'Everyday', 'Pro', 'Mini'];

function card(r, i) {
  const deal = i % 7 === 0, sponsored = i % 5 === 1;
  const whole = 9 + Math.floor(r() * 140), frac = String(Math.floor(r() * 100)).padStart(2, '0');
  const rating = Math.round((3 + r() * 2) * 2) / 2;
  const stars = Array.from({ length: 5 }, (_, s) => `<span class="star${s < Math.floor(rating) ? ' on' : ''}">★</span>`).join('');
  const img = `/perf/art.svg?i=${i}`;
  const inline = deal ? ` style="background-color:${pick(r, LIGHTS)};border-color:${pick(r, BORDERS)}"` : '';
  return `<div class="card" data-id="p${i}"${inline}>
  <a class="media" href="#p${i}"><img class="lazy" alt="${pick(r, ADJ)} ${pick(r, NAMES)}" width="200" height="200"
    src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="${img}&w=200"
    data-srcset="${img}&w=200 1x, ${img}&w=400 2x"></a>
  ${deal ? '<div class="badge deal">Limited deal</div>' : i % 4 === 0 ? '<div class="badge">Top pick</div>' : ''}
  ${sponsored ? '<div class="sponsored">Sponsored</div>' : ''}
  <h2><a href="#p${i}">${pick(r, ADJ)} ${pick(r, NAMES)}, ${pick(r, ['black', 'white', 'sage', 'clay', 'steel'])}</a></h2>
  <div class="stars" role="img" aria-label="${rating} out of 5">${stars}<span class="count">${Math.floor(r() * 9000)}</span></div>
  <div class="price"><span class="sym">$</span>${whole}<span class="frac">${frac}</span>${r() < 0.3 ? ` <s class="was">$${whole + 10}.00</s>` : ''}</div>
  <div class="ship">Ships ${pick(r, ['tomorrow', 'in 2 days', 'Friday'])}</div>
  <button class="add" type="button">Add to cart</button>
</div>`;
}

function carousel(r, c) {
  const slides = Array.from({ length: GRID.slides }, (_, s) => {
    const thumbs = Array.from({ length: GRID.thumbs }, (_, t) =>
      `<span class="thumb" style="background-color:${pick(r, LIGHTS)}">${t + 1}</span>`).join('');
    return `<div class="slide"><h4>Pick ${c}.${s}</h4><div class="inner"><div class="track">${thumbs}</div></div>` +
      `<img alt="" width="120" height="120" src="/perf/art.svg?i=${100 + c * 20 + s}&w=120"></div>`;
  }).join('');
  return `<section class="carousel" data-c="${c}"><h3>Related picks ${c + 1}</h3><button type="button">Previous</button>` +
    `<div class="track">${slides}</div><button type="button">Next</button></section>`;
}

function gridPage(urls) {
  const r = rng(60);
  const site = Array.from({ length: GRID.siteSheets }, (_, i) => `<link rel="stylesheet" href="/perf/grid-site-${i}.css">`);
  const cdn = Array.from({ length: GRID.cdnSheets }, (_, i) => `<link rel="stylesheet" href="${urls.CDN}/perf/grid-cdn-${i}.css">`);
  const facets = Array.from({ length: 24 }, (_, i) => `<label class="facet"><input type="checkbox"> Option ${i + 1}</label>`).join('');
  const cards = Array.from({ length: GRID.cards }, (_, i) => card(r, i)).join('\n');
  const carousels = Array.from({ length: GRID.carousels }, (_, c) => carousel(r, c)).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Store search</title>
${site.join('')}${cdn.join('')}
<style>
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.card{border:1px solid #d5d9d9;padding:8px;background:#fff;color:#0f1111}
.card img{display:block;width:100%;height:auto;aspect-ratio:1}
.side{float:left;width:200px}.results{margin-left:216px}
.carousel .track{display:flex;overflow-x:auto;gap:8px}.carousel .slide{flex:0 0 180px}
.carousel .inner .track{overflow:hidden}.thumb{display:inline-block;width:30px;height:30px}
.recs{display:flex;flex-wrap:wrap;gap:6px;min-height:60px}.recs .ad{width:160px;border:1px solid #ddd}
</style></head>
<body>
<header class="top"><div class="search"><input type="search" aria-label="Search" value="kettle base"></div>
<nav class="nav"><a href="#">Deals</a> <a href="#">Kitchen</a> <a href="#">Coffee</a> <a href="#">Help</a></nav></header>
<aside class="side"><h3>Filters</h3>${facets}<span class="pill">Under $25</span> <span class="pill on">4 stars &amp; up</span></aside>
<div class="results"><div class="results-bar">1-60 of over 2,000 results</div>
<div class="recs" id="recs"></div>
<div class="grid" id="grid">${cards}</div>
${carousels}</div>
<footer class="bottom"><a href="#">Back to top</a></footer>
<script>
// Lazy images: swap in src/srcset when a card nears the viewport.
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const img = e.target;
    img.src = img.dataset.src;
    img.srcset = img.dataset.srcset;
    img.classList.remove('lazy');
    io.unobserve(img);
  }
}, { rootMargin: '200px' });
for (const img of document.querySelectorAll('img.lazy')) io.observe(img);

// Carousels auto-advance (inline transform writes, like slideshow scripts).
let tick = 0;
setInterval(() => {
  tick++;
  for (const t of document.querySelectorAll('.carousel > .track')) t.style.transform = 'translateX(' + (-(tick % 6) * 30) + 'px)';
}, 500);

// The storm: ~${GRID.stormRate} mutations/s for ${GRID.stormMs} ms (ad and recommendation inserts and
// removals, class/attribute/style flips, price text swaps), plus scrolling.
const LIGHTS = ${JSON.stringify(LIGHTS)};
globalThis.__storm = () => new Promise((done) => {
  const grid = document.getElementById('grid'), recs = document.getElementById('recs');
  const cards = grid.children;
  const t0 = performance.now();
  let n = 0, k = 0;
  const one = () => {
    k++;
    const c = cards[(k * 13) % cards.length];
    switch (k % 6) {
      case 0: {
        const ad = document.createElement('div');
        ad.className = 'ad';
        ad.setAttribute('style', 'background-color:' + LIGHTS[k % LIGHTS.length] + ';color:#0f1111');
        ad.innerHTML = '<span class="tag">Ad</span><p>Suggested item ' + k + '</p>';
        recs.appendChild(ad);
        if (recs.children.length > 24) recs.firstElementChild.remove();
        break;
      }
      case 1: c.classList.toggle('seen'); break;
      case 2: c.setAttribute('aria-busy', c.getAttribute('aria-busy') === 'true' ? 'false' : 'true'); break;
      case 3: c.querySelector('.count').textContent = String(1000 + k); break;
      case 4: c.classList.toggle('hot'); break;
      default: {
        const b = c.querySelector('.ship');
        b.setAttribute('style', 'background-color:' + LIGHTS[k % LIGHTS.length]);
      }
    }
    n++;
  };
  const steps = ${GRID.scrollSteps};
  let s = 0;
  const scroller = setInterval(() => {
    window.scrollBy(0, s < steps / 2 ? ${GRID.scrollPx} : -${GRID.scrollPx});
    if (++s >= steps) clearInterval(scroller);
  }, ${GRID.scrollEveryMs});
  const timer = setInterval(() => {
    const elapsed = performance.now() - t0;
    const due = Math.min(Math.floor(elapsed * ${GRID.stormRate / 1000}), ${(GRID.stormRate * GRID.stormMs) / 1000});
    while (n < due) one();
    if (elapsed >= ${GRID.stormMs}) {
      clearInterval(timer);
      done({ mutations: n, t0, t1: performance.now() });
    }
  }, 5);
});
</script></body></html>`;
}

function art(i, w) {
  const r = rng(1000 + i);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}" viewBox="0 0 100 100">` +
    `<rect width="100" height="100" fill="${hex(r, 200, 255)}"/>` +
    `<circle cx="${30 + r() * 40}" cy="${30 + r() * 40}" r="${15 + r() * 15}" fill="${hex(r, 40, 200)}"/>` +
    `<rect x="20" y="70" width="60" height="12" rx="6" fill="${hex(r, 20, 120)}"/></svg>`;
}

export function route(pathname, search, urls) {
  let m;
  if (pathname === '/perf/nodes.html') return { type: HTML, body: nodesPage() };
  if (pathname === '/perf/grid.html') return { type: HTML, body: gridPage(urls) };
  if ((m = /^\/perf\/nodes-(\d+)\.css$/.exec(pathname))) return { type: CSS, body: sheet(10 + Number(m[1]), NODES.rulesPerSheet) };
  if ((m = /^\/perf\/grid-site-(\d+)\.css$/.exec(pathname))) return { type: CSS, body: sheet(100 + Number(m[1]), GRID.rulesPerSheet) };
  if ((m = /^\/perf\/grid-cdn-(\d+)\.css$/.exec(pathname))) return { type: CSS, body: sheet(200 + Number(m[1]), GRID.rulesPerSheet) };
  if (pathname === '/perf/art.svg') return { type: SVG, body: art(Number(search.get('i')) || 0, Number(search.get('w')) || 200) };
  return null;
}
