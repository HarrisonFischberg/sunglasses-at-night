// Turns measurements into per-category statuses. Thresholds are stated here,
// once, and the report prints them. Statuses: PASS FAIL BLOCKED UNTESTED
// NEEDS_REVIEW NOT_APPLICABLE, each with a reason.
export const T = {
  flash: { pass: 0.03, fail: 0.10, note: 'max fraction of the page viewport that is bright (L>0.75) in some frame but dark (L<0.2) once settled' },
  surface: { lightPage: 0.25, pass: 0.12, fail: 0.30, note: 'fraction of the page viewport with L>0.75 after dark mode (pages whose original is <25% bright are treated as already dark)' },
  media: { note: 'per image region, OFF vs ON of the same loaded page, on the picture\'s own pixels (not the background showing through transparency): FAIL when a photo goes near-black or loses its color; NEEDS_REVIEW when dimmed (or a carousel moved) or when an unchanged dark transparent logo becomes invisible' },
  text: { note: 'per text box, 3rd/97th percentile luminance contrast in the ON capture; flagged when it was ≥4.5 OFF and is <3 ON (screenshot estimate, not a computed-style audit)' },
  restore: { stuck: 0.03, changed: 0.25, note: 'fresh OFF vs OFF-after-ON: FAIL when >3% of originally bright pixels stay dark; NEEDS_REVIEW when >25% of pixels differ (often live content)' },
};

const S = (status, reason, extra = {}) => ({ status, reason, ...extra });
const cr = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const BLOCK_PATTERNS = [
  [/captcha|are you a robot|verify you are (a )?human|press (&|and) hold|unusual traffic|bot detection/i, 'CAPTCHA / bot check'],
  [/access denied|request blocked|403 forbidden|error 1020|not available in your (country|region)/i, 'access denied'],
  [/safari (can.?t|cannot) (open|find|connect)|server stopped responding|not connected to the internet/i, 'page did not load'],
  [/(sign|log) in to (continue|view)|create an account to continue|log in to see/i, 'login wall'],
  [/subscribe to (continue|read)|you.ve reached your (free )?(article )?limit/i, 'paywall'],
];

export function blockedReason(texts) {
  const joined = texts.join(' \n ');
  for (const [re, why] of BLOCK_PATTERNS) if (re.test(joined)) return why;
  return null;
}

export function judgeFlash(seg) {
  if (!seg) return S('UNTESTED', 'no temporal capture for this navigation');
  if (seg.error) return S('UNTESTED', `video: ${seg.error}`);
  // Safari stops drawing a covered window; a near-empty recording proves nothing.
  if ((seg.frames ?? 0) < 10) return S('UNTESTED', `only ${seg.frames ?? 0} frames recorded (window covered or not drawn); flash not measurable`);
  const u = seg.maxUnintended;
  const unc = `capture ${seg.frames} frames, max gap ${Math.round(seg.maxGap * 1000)} ms`;
  if (u <= T.flash.pass) return S('PASS', `no bright frame over ${T.flash.pass * 100}% of viewport (max ${(u * 100).toFixed(1)}%); ${unc}`);
  if (u >= T.flash.fail) return S('FAIL', `bright area up to ${(u * 100).toFixed(0)}% of viewport for ${seg.unintendedSecs.toFixed(2)} s before settling dark; ${unc}`);
  return S('NEEDS_REVIEW', `bright area up to ${(u * 100).toFixed(1)}%; ${unc}`);
}

export function judgeSurface(pair, startupPair) {
  if (!pair || pair.error) return S('UNTESTED', 'no paired capture');
  // Surfaces only: pixels outside the media regions the capture identified.
  const off = pair.surfBrightOff ?? pair.brightOff, on = pair.surfBrightOn ?? pair.brightOn;
  const onStart = startupPair ? (startupPair.surfBrightOn ?? startupPair.brightOn) : null;
  if (pair.surfFrac != null && pair.surfFrac < 0.15) return S('NOT_APPLICABLE', `page viewport is ${pct(1 - pair.surfFrac)} media (map, video or photo)`);
  if (off < T.surface.lightPage) {
    if (on > off + 0.1) return S('FAIL', `page was already dark (${pct(off)} bright surfaces) and got brighter (${pct(on)})`);
    return S('NOT_APPLICABLE', `original page already mostly dark (${pct(off)} bright surfaces); left essentially as is (${pct(on)})`);
  }
  const worst = Math.max(on, onStart ?? 0);
  if (worst <= T.surface.pass) return S('PASS', `bright surfaces ${pct(off)} → ${pct(on)} (startup ${pct(onStart)}), media excluded`);
  if (worst >= T.surface.fail) return S('FAIL', `bright surfaces stay ${pct(worst)} after dark mode (original ${pct(off)}), media excluded`);
  return S('NEEDS_REVIEW', `bright surfaces ${pct(worst)} after dark mode (original ${pct(off)}), media excluded`);
}

export function judgeMedia(pairs) {
  const imgs = pairs.flatMap((p) => (p?.images ?? []).map((i) => ({ ...i, pair: p.name })));
  if (!imgs.length) return S('NOT_APPLICABLE', 'no visible image regions in the captures');
  const bad = [], review = [];
  let pictures = 0;
  for (const i of imgs) {
    // A picture: most of the region differs from what is behind it, and it has
    // color or tone. Small grayscale glyph-like regions are UI icons, which a
    // dark theme may legitimately recolor.
    // Product cutouts on white are pictures too: a large region with a small
    // but colorful subject.
    const big = (i.rect?.[2] ?? 0) >= 150 && (i.rect?.[3] ?? 0) >= 150;
    const picture = (i.salient > 0.35 && (i.salSatOff > 0.12 || i.salient > 0.6)) || (big && i.salient > 0.08 && i.salSatOff > 0.2);
    const icon = !picture && i.salient > 0.02;
    if (picture) {
      pictures++;
      const blackened = i.salLumOff > 0.08 && i.salLumOn < 0.35 * i.salLumOff && i.salSame < 0.1;
      const greyed = i.salSatOff > 0.2 && i.salSatOn < 0.5 * i.salSatOff && i.salSame < 0.15;
      const dimmed = i.salLumOff > 0.08 && i.salLumOn < 0.7 * i.salLumOff && i.salSame < 0.3;
      if ((blackened || greyed) && !big && (i.rect?.[2] ?? 0) < 150) review.push({ ...i, why: 'small colored icon/brand mark recolored (lighter or less saturated)' });
      else if (blackened || greyed) bad.push({ ...i, why: blackened ? 'photo went near-black' : 'photo lost its color' });
      else if (dimmed) review.push({ ...i, why: 'photo darker (dimmed, or a carousel moved)' });
    } else if (icon) {
      // A logo/icon (glyphs on a transparent background) that was clearly
      // visible OFF and nearly vanishes against the dark background ON.
      const cOff = cr(i.salLumOff, i.bgLumOff), cOn = cr(i.salLumOn, i.bgLumOn);
      if (cOff >= 3 && cOn < 1.6) review.push({ ...i, cOff: +cOff.toFixed(2), cOn: +cOn.toFixed(2), why: 'logo/icon nearly invisible on the dark background' });
    }
  }
  if (bad.length) return S('FAIL', `${bad.length}/${pictures} photos: ${bad[0].why}`, { flagged: bad.slice(0, 8) });
  if (review.length) return S('NEEDS_REVIEW', `${review.length} of ${imgs.length} image regions: ${[...new Set(review.map((r) => r.why))].join('; ')}`, { flagged: review.slice(0, 8) });
  return S('PASS', `${pictures} photos keep tone and color; ${imgs.length - pictures} icon/transparent regions not scored as photos`);
}

export function judgeText(pair) {
  if (!pair || pair.error) return S('UNTESTED', 'no paired capture');
  const t = (pair.texts ?? []).filter((x) => x.cOff >= 4.5);
  if (!t.length) return S('NEEDS_REVIEW', 'no measurable text boxes');
  const low = t.filter((x) => x.cOn < 3);
  const share = low.length / t.length;
  if (low.length >= 3 && share > 0.1) return S('FAIL', `${low.length}/${t.length} text boxes drop below 3:1 (were ≥4.5:1)`, { flagged: low.slice(0, 8) });
  if (low.length) return S('NEEDS_REVIEW', `${low.length}/${t.length} text boxes below 3:1 in the screenshot estimate`, { flagged: low.slice(0, 8) });
  return S('PASS', `${t.length} text boxes ≥3:1 by screenshot estimate`);
}

export function judgeFunction(offMeta, onMeta, statuses) {
  if (!offMeta || !onMeta) return S('UNTESTED', 'missing captures');
  const lo = offMeta.counts?.link ?? 0, ln = onMeta.counts?.link ?? 0;
  const bo = offMeta.counts?.button ?? 0, bn = onMeta.counts?.button ?? 0;
  if (!statuses.on || !statuses.off) return S('NEEDS_REVIEW', 'popup status not read back');
  if (lo > 5 && ln < 0.7 * lo) return S('NEEDS_REVIEW', `links in the accessibility tree ${lo} → ${ln}`);
  if (bo > 5 && bn < 0.7 * bo) return S('NEEDS_REVIEW', `buttons ${bo} → ${bn}`);
  return S('PASS', `page structure kept (links ${lo}→${ln}, buttons ${bo}→${bn}); popup toggled ("${statuses.on}")`);
}

export function judgeRestore(r) {
  if (!r || r.error) return S('UNTESTED', 'no restoration capture');
  if (r.stuckDarkFrac > T.restore.stuck) return S('FAIL', `${pct(r.stuckDarkFrac)} of originally bright pixels still dark after turning off`);
  if (r.changedFrac > T.restore.changed) return S('NEEDS_REVIEW', `${pct(r.changedFrac)} of pixels differ from a fresh load (live content?)`);
  return S('PASS', `matches a fresh load (diff ${pct(r.changedFrac)}, stuck-dark ${pct(r.stuckDarkFrac)})`);
}

const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);
