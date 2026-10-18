// Sunglasses at Night: color engine.
// Parses CSS color syntaxes (CSS Color 4/5), converts between color spaces,
// gamut-maps into sRGB, and measures WCAG 2.x contrast.
// Pure functions only: no DOM, no storage, no network.

const DEG = 180 / Math.PI;

// ---------------------------------------------------------------- matrices

function mul3(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

function invert3(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

// Linear-light RGB → CIE XYZ matrices from CSS Color 4 sample code.
const SRGB_TO_XYZ = [
  [506752 / 1228815, 87881 / 245763, 12673 / 70218],
  [87098 / 409605, 175762 / 245763, 12673 / 175545],
  [7918 / 409605, 87881 / 737289, 1001167 / 1053270],
];
const P3_TO_XYZ = [
  [608311 / 1250200, 189793 / 714400, 198249 / 1000160],
  [35783 / 156275, 247089 / 357200, 198249 / 2500400],
  [0, 32229 / 714400, 5220557 / 5000800],
];
const A98_TO_XYZ = [
  [573536 / 994567, 263643 / 1420810, 187206 / 994567],
  [591459 / 1989134, 6239551 / 9945670, 374412 / 4972835],
  [53769 / 1989134, 351524 / 4972835, 4929758 / 4972835],
];
const REC2020_TO_XYZ = [
  [63426534 / 99577255, 20160776 / 139408157, 47086771 / 278816314],
  [26158966 / 99577255, 472592308 / 697040785, 8267143 / 139408157],
  [0, 19567812 / 697040785, 295819943 / 278816314],
];
// ProPhoto is D50-relative.
const PROPHOTO_TO_XYZ50 = [
  [0.7977666449006423, 0.13518129740053308, 0.0313477341283922],
  [0.2880748288194013, 0.711835234241873, 0.00008993693872564],
  [0, 0, 0.8251046025104602],
];
// Bradford chromatic adaptation.
const D50_TO_D65 = [
  [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
  [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
  [0.012314014864481998, -0.020507649298898964, 1.330365926242124],
];
const D65_TO_D50 = invert3(D50_TO_D65);
const D50_WHITE = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];

// OKLab (Björn Ottosson), defined on linear sRGB.
const LIN_SRGB_TO_LMS = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];
const LMS_TO_OKLAB = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];
// Inverses are computed rather than hard-coded: the published 10-digit
// inverse matrices round-trip only to ~1e-6.
const OKLAB_TO_LMS = invert3(LMS_TO_OKLAB);
const LMS_TO_LIN_SRGB = invert3(LIN_SRGB_TO_LMS);

// --------------------------------------------------------- transfer curves

const signPow = (c, p) => Math.sign(c) * Math.abs(c) ** p;

function srgbToLinear(c) {
  const a = Math.abs(c);
  return a <= 0.04045 ? c / 12.92 : Math.sign(c) * ((a + 0.055) / 1.055) ** 2.4;
}
function srgbFromLinear(c) {
  const a = Math.abs(c);
  return a > 0.0031308 ? Math.sign(c) * (1.055 * a ** (1 / 2.4) - 0.055) : 12.92 * c;
}
const REC_A = 1.09929682680944, REC_B = 0.018053968510807;
function rec2020ToLinear(c) {
  const a = Math.abs(c);
  return a < REC_B * 4.5 ? c / 4.5 : Math.sign(c) * ((a + REC_A - 1) / REC_A) ** (1 / 0.45);
}
function rec2020FromLinear(c) {
  const a = Math.abs(c);
  return a > REC_B ? Math.sign(c) * (REC_A * a ** 0.45 - (REC_A - 1)) : 4.5 * c;
}
function prophotoToLinear(c) {
  return Math.abs(c) <= 16 / 512 ? c / 16 : signPow(c, 1.8);
}
function prophotoFromLinear(c) {
  return Math.abs(c) >= 1 / 512 ? signPow(c, 1 / 1.8) : 16 * c;
}

// ------------------------------------------------------------ color spaces
// Each space converts its coords to/from CIE XYZ (D65). `kinds` names the
// analogous component of each coord, used to carry `none` across spaces.

const RGB_KINDS = ['r', 'g', 'b'];

function rgbSpace(toXyz, toLin, fromLin) {
  const fromXyz = invert3(toXyz);
  return {
    kinds: RGB_KINDS,
    toXyz: (c) => mul3(toXyz, c.map(toLin)),
    fromXyz: (xyz) => mul3(fromXyz, xyz).map(fromLin),
  };
}

const identity = (c) => c;
const XYZ_TO_SRGB = invert3(SRGB_TO_XYZ);

function linSrgbFromXyz(xyz) { return mul3(XYZ_TO_SRGB, xyz); }

const LAB_E = 216 / 24389, LAB_K = 24389 / 27;

function labFromXyz(xyz) {
  const f = mul3(D65_TO_D50, xyz).map((v, i) => {
    const x = v / D50_WHITE[i];
    return x > LAB_E ? Math.cbrt(x) : (LAB_K * x + 16) / 116;
  });
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}
function labToXyz([L, a, b]) {
  const f1 = (L + 16) / 116, f0 = a / 500 + f1, f2 = f1 - b / 200;
  const x = f0 ** 3 > LAB_E ? f0 ** 3 : (116 * f0 - 16) / LAB_K;
  const y = L > LAB_K * LAB_E ? f1 ** 3 : L / LAB_K;
  const z = f2 ** 3 > LAB_E ? f2 ** 3 : (116 * f2 - 16) / LAB_K;
  return mul3(D50_TO_D65, [x * D50_WHITE[0], y * D50_WHITE[1], z * D50_WHITE[2]]);
}
function oklabFromXyz(xyz) {
  const lms = mul3(LIN_SRGB_TO_LMS, linSrgbFromXyz(xyz)).map(Math.cbrt);
  return mul3(LMS_TO_OKLAB, lms);
}
function oklabToXyz(lab) {
  const lms = mul3(OKLAB_TO_LMS, lab).map((v) => v ** 3);
  return mul3(SRGB_TO_XYZ, mul3(LMS_TO_LIN_SRGB, lms));
}

function normHue(h) {
  const r = h % 360;
  return r < 0 ? r + 360 : r;
}
// Rectangular → polar; hue is `none` (NaN) when the color is achromatic.
function toPolar([L, a, b], epsilon) {
  const C = Math.hypot(a, b);
  return [L, C, C < epsilon ? NaN : normHue(Math.atan2(b, a) * DEG)];
}
function fromPolar([L, C, h]) {
  const r = (Number.isNaN(h) ? 0 : h) / DEG;
  return [L, C * Math.cos(r), C * Math.sin(r)];
}

// HSL/HWB use sRGB coords 0..1 and s/l/w/b on a 0..100 scale.
function hslToSrgb([h, s, l]) {
  h = normHue(Number.isNaN(h) ? 0 : h);
  s /= 100;
  l /= 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
function srgbToHsl([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let h = NaN, s = 0;
  if (d > 1e-6) {
    s = l === 0 || l === 1 ? 0 : (max - l) / Math.min(l, 1 - l);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  if (s < 0) {
    h += 180;
    s = -s;
  }
  return [Number.isNaN(h) ? h : normHue(h), s * 100, l * 100];
}
function hwbToSrgb([h, w, b]) {
  w /= 100;
  b /= 100;
  if (w + b >= 1) {
    const gray = w / (w + b);
    return [gray, gray, gray];
  }
  return hslToSrgb([h, 100, 50]).map((c) => c * (1 - w - b) + w);
}
function srgbToHwb(rgb) {
  const w = Math.min(...rgb), bl = 1 - Math.max(...rgb);
  const h = w + bl >= 1 - 1e-6 ? NaN : srgbToHsl(rgb)[0];
  return [h, w * 100, bl * 100];
}

const SRGB = rgbSpace(SRGB_TO_XYZ, srgbToLinear, srgbFromLinear);
const XYZ_D65 = { kinds: RGB_KINDS, toXyz: identity, fromXyz: identity };

export const SPACES = {
  srgb: SRGB,
  'srgb-linear': rgbSpace(SRGB_TO_XYZ, identity, identity),
  'display-p3': rgbSpace(P3_TO_XYZ, srgbToLinear, srgbFromLinear),
  'a98-rgb': rgbSpace(A98_TO_XYZ, (c) => signPow(c, 563 / 256), (c) => signPow(c, 256 / 563)),
  'prophoto-rgb': rgbSpace(
    mul3x3(D50_TO_D65, PROPHOTO_TO_XYZ50),
    prophotoToLinear,
    prophotoFromLinear,
  ),
  rec2020: rgbSpace(REC2020_TO_XYZ, rec2020ToLinear, rec2020FromLinear),
  xyz: XYZ_D65,
  'xyz-d65': XYZ_D65,
  'xyz-d50': {
    kinds: RGB_KINDS,
    toXyz: (c) => mul3(D50_TO_D65, c),
    fromXyz: (xyz) => mul3(D65_TO_D50, xyz),
  },
  lab: { kinds: ['L', 'A', 'B'], toXyz: labToXyz, fromXyz: labFromXyz },
  lch: {
    kinds: ['L', 'C', 'H'],
    hue: 2,
    toXyz: (c) => labToXyz(fromPolar(c)),
    fromXyz: (xyz) => toPolar(labFromXyz(xyz), 0.0015),
  },
  oklab: { kinds: ['L', 'A', 'B'], toXyz: oklabToXyz, fromXyz: oklabFromXyz },
  oklch: {
    kinds: ['L', 'C', 'H'],
    hue: 2,
    toXyz: (c) => oklabToXyz(fromPolar(c)),
    fromXyz: (xyz) => toPolar(oklabFromXyz(xyz), 0.00002),
  },
  hsl: {
    kinds: ['H', 'C', 'L'],
    hue: 0,
    toXyz: (c) => SRGB.toXyz(hslToSrgb(c)),
    fromXyz: (xyz) => srgbToHsl(SRGB.fromXyz(xyz)),
  },
  hwb: {
    kinds: ['H', null, null],
    hue: 0,
    toXyz: (c) => SRGB.toXyz(hwbToSrgb(c)),
    fromXyz: (xyz) => srgbToHwb(SRGB.fromXyz(xyz)),
  },
};

function mul3x3(a, b) {
  return a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
}

/**
 * Convert a raw color `{ space, coords, alpha }` into another space.
 * Missing (`none` = NaN) components carry over to analogous components.
 */
export function convert(color, to) {
  if (color.space === to) return { space: to, coords: color.coords.slice(), alpha: color.alpha };
  const from = SPACES[color.space], target = SPACES[to];
  const xyz = from.toXyz(color.coords.map((v) => (Number.isNaN(v) ? 0 : v)));
  const coords = target.fromXyz(xyz);
  color.coords.forEach((v, i) => {
    if (!Number.isNaN(v)) return;
    const j = target.kinds.indexOf(from.kinds[i]);
    if (from.kinds[i] && j >= 0) coords[j] = NaN;
  });
  return { space: to, coords, alpha: color.alpha };
}

// ------------------------------------------------------------ named colors

const NAMED_HEX =
  'aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff ' +
  'beige:f5f5dc bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff ' +
  'blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 ' +
  'chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c ' +
  'cyan:00ffff darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 ' +
  'darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b ' +
  'darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 ' +
  'darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f ' +
  'darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 ' +
  'deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 ' +
  'floralwhite:fffaf0 forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ' +
  'ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 green:008000 ' +
  'greenyellow:adff2f grey:808080 honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c ' +
  'indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 ' +
  'lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 ' +
  'lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 ' +
  'lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa ' +
  'lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 ' +
  'lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6 ' +
  'magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd ' +
  'mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 ' +
  'mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc ' +
  'mediumvioletred:c71585 midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 ' +
  'moccasin:ffe4b5 navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 ' +
  'olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa ' +
  'palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 ' +
  'peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 ' +
  'purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1 ' +
  'saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee ' +
  'sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 ' +
  'slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c ' +
  'teal:008080 thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee ' +
  'wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00 yellowgreen:9acd32';

export const NAMED_COLORS = Object.freeze(
  Object.fromEntries(NAMED_HEX.split(' ').map((pair) => pair.split(':'))),
);

// System colors depend on the browser and color scheme, so they can't be
// resolved here; callers read them from computed style instead.
const SYSTEM_COLORS = new Set([
  'accentcolor', 'accentcolortext', 'activetext', 'buttonborder', 'buttonface',
  'buttontext', 'canvas', 'canvastext', 'field', 'fieldtext', 'graytext', 'highlight',
  'highlighttext', 'linktext', 'mark', 'marktext', 'selecteditem', 'selecteditemtext',
  'visitedtext',
]);

// ------------------------------------------------------------- tokenizing

// Split a function body into top-level tokens; ',' and '/' are their own tokens.
function splitArgs(body) {
  const out = [];
  let cur = '', depth = 0;
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) return null;
    if (depth === 0 && (ch === ',' || ch === '/')) {
      if (cur) out.push(cur);
      out.push(ch);
      cur = '';
    } else if (depth === 0 && /\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (depth !== 0) return null;
  if (cur) out.push(cur);
  return out;
}

const NUMBER_RE = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)$/;
const ANGLE_TO_DEG = { deg: 1, rad: DEG, grad: 0.9, turn: 360 };

// A dimension → { value, unit } with unit '', '%' or 'deg'.
function dimension(value, unit) {
  if (unit === '' || unit === '%') return { value, unit };
  if (unit in ANGLE_TO_DEG) return { value: value * ANGLE_TO_DEG[unit], unit: 'deg' };
  return null;
}

// Parse one channel token: number, percentage, angle, channel keyword or calc().
function quantity(tok, env) {
  const m = NUMBER_RE.exec(tok);
  if (m) return dimension(Number(m[1]), m[2]);
  if (env && Object.hasOwn(env, tok)) return { value: env[tok], unit: '' };
  if (tok.startsWith('calc(') && tok.endsWith(')')) return evalCalc(tok.slice(5, -1), env);
  return null;
}

const CALC_TOKEN_RE = /\s*(?:((?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?[a-z%]*)|([a-z][a-z0-9]*)\(|([a-z][a-z0-9]*)|([-+*/()]))/y;
const CALC_CONSTANTS = { pi: Math.PI, e: Math.E };

// Evaluate calc() with + - * /, parentheses and channel keywords.
function evalCalc(expr, env) {
  const toks = [];
  CALC_TOKEN_RE.lastIndex = 0;
  while (CALC_TOKEN_RE.lastIndex < expr.length) {
    if (/^\s*$/.test(expr.slice(CALC_TOKEN_RE.lastIndex))) break;
    const m = CALC_TOKEN_RE.exec(expr);
    if (!m) return null;
    if (m[1]) toks.push({ num: m[1] });
    else if (m[2]) {
      if (m[2] !== 'calc') return null;
      toks.push({ op: '(' });
    } else if (m[3]) toks.push({ id: m[3] });
    else toks.push({ op: m[4] });
  }
  let i = 0;
  const peek = () => toks[i]?.op;
  function primary() {
    const t = toks[i++];
    if (!t) return null;
    if (t.num) {
      const m = NUMBER_RE.exec(t.num);
      return m && dimension(Number(m[1]), m[2]);
    }
    if (t.id) {
      if (env && Object.hasOwn(env, t.id)) return { value: env[t.id], unit: '' };
      if (Object.hasOwn(CALC_CONSTANTS, t.id)) return { value: CALC_CONSTANTS[t.id], unit: '' };
      return null;
    }
    if (t.op === '(') {
      const v = sum();
      if (toks[i++]?.op !== ')') return null;
      return v;
    }
    if (t.op === '-' || t.op === '+') {
      const v = primary();
      return v && { value: t.op === '-' ? -v.value : v.value, unit: v.unit };
    }
    return null;
  }
  function product() {
    let left = primary();
    while (left && (peek() === '*' || peek() === '/')) {
      const op = toks[i++].op;
      const right = primary();
      if (!right) return null;
      if (op === '*') {
        if (left.unit && right.unit) return null;
        left = { value: left.value * right.value, unit: left.unit || right.unit };
      } else {
        if (right.unit) return null;
        left = { value: left.value / right.value, unit: left.unit };
      }
    }
    return left;
  }
  function sum() {
    let left = product();
    while (left && (peek() === '+' || peek() === '-')) {
      const op = toks[i++].op;
      const right = product();
      if (!right || right.unit !== left.unit) return null;
      left = { value: op === '+' ? left.value + right.value : left.value - right.value, unit: left.unit };
    }
    return left;
  }
  const v = sum();
  if (!v || i !== toks.length || !Number.isFinite(v.value)) return null;
  return v;
}

// ---------------------------------------------------------------- parsing

const clamp = (v, lo, hi) => (Number.isNaN(v) ? v : Math.min(hi, Math.max(lo, v)));

// Channel specs: `pct` is what 100% means; `hue` channels take angles.
const FUNCTIONS = {
  rgb: {
    space: 'srgb', legacy: true, keys: ['r', 'g', 'b'], ch: [{ pct: 255 }, { pct: 255 }, { pct: 255 }],
    toEnv: (c) => c.map((v) => v * 255),
    finish: (c) => c.map((v) => clamp(v, 0, 255) / 255),
  },
  hsl: {
    space: 'hsl', legacy: true, keys: ['h', 's', 'l'], ch: [{ hue: true }, { pct: 100 }, { pct: 100 }],
    finish: ([h, s, l]) => [h, clamp(s, 0, 100), clamp(l, 0, 100)],
  },
  hwb: {
    space: 'hwb', keys: ['h', 'w', 'b'], ch: [{ hue: true }, { pct: 100 }, { pct: 100 }],
    finish: ([h, w, b]) => [h, clamp(w, 0, 100), clamp(b, 0, 100)],
  },
  lab: {
    space: 'lab', keys: ['l', 'a', 'b'], ch: [{ pct: 100 }, { pct: 125 }, { pct: 125 }],
    finish: ([L, a, b]) => [clamp(L, 0, 100), a, b],
  },
  lch: {
    space: 'lch', keys: ['l', 'c', 'h'], ch: [{ pct: 100 }, { pct: 150 }, { hue: true }],
    finish: ([L, C, h]) => [clamp(L, 0, 100), clamp(C, 0, Infinity), h],
  },
  oklab: {
    space: 'oklab', keys: ['l', 'a', 'b'], ch: [{ pct: 1 }, { pct: 0.4 }, { pct: 0.4 }],
    finish: ([L, a, b]) => [clamp(L, 0, 1), a, b],
  },
  oklch: {
    space: 'oklch', keys: ['l', 'c', 'h'], ch: [{ pct: 1 }, { pct: 0.4 }, { hue: true }],
    finish: ([L, C, h]) => [clamp(L, 0, 1), clamp(C, 0, Infinity), h],
  },
};
FUNCTIONS.rgba = FUNCTIONS.rgb;
FUNCTIONS.hsla = FUNCTIONS.hsl;

const PREDEFINED = ['srgb', 'srgb-linear', 'display-p3', 'a98-rgb', 'prophoto-rgb', 'rec2020', 'xyz', 'xyz-d50', 'xyz-d65'];
const UNIT_CHANNEL = { pct: 1 };

function channel(tok, spec, env) {
  if (tok === 'none') return { value: NaN, unit: 'none' };
  const q = quantity(tok, env);
  if (!q) return null;
  if (spec.hue) return q.unit === '%' ? null : q;
  if (q.unit === 'deg') return null;
  return q.unit === '%' ? { value: (q.value / 100) * spec.pct, unit: '%' } : q;
}

function alphaValue(tok, env) {
  const q = channel(tok, { pct: 1 }, env);
  return q && { value: clamp(q.value, 0, 1), unit: q.unit };
}

function parseHex(s) {
  const hex = s.slice(1);
  if (!/^[0-9a-f]+$/.test(hex) || ![3, 4, 6, 8].includes(hex.length)) return null;
  const short = hex.length <= 4;
  const parts = short ? hex.split('').map((h) => h + h) : hex.match(/../g);
  const v = parts.map((p) => parseInt(p, 16) / 255);
  return { space: 'srgb', coords: v.slice(0, 3), alpha: v.length === 4 ? v[3] : 1 };
}

// Parses `from <color>` and returns the channel environment of the origin.
function relativeOrigin(toks, opts) {
  if (toks[0] !== 'from') return { rest: toks, env: null, origin: null };
  if (toks.length < 2) return null;
  const origin = parseRaw(toks[1], opts);
  if (!origin) return null;
  return { rest: toks.slice(2), origin };
}

function originEnv(origin, space, keys, toEnv) {
  const c = convert(origin, space);
  const coords = c.coords.map((v) => (Number.isNaN(v) ? 0 : v));
  const vals = toEnv ? toEnv(coords) : coords;
  const env = { alpha: Number.isNaN(c.alpha) ? 0 : c.alpha };
  keys.forEach((k, i) => (env[k] = vals[i]));
  return env;
}

// Modern syntax: three channels, optional `/ alpha`.
function modernChannels(toks, specs, env, defaultAlpha) {
  if (toks.includes(',')) return null;
  const slash = toks.indexOf('/');
  const chToks = slash < 0 ? toks : toks.slice(0, slash);
  if (chToks.length !== 3) return null;
  if (slash >= 0 && toks.length !== slash + 2) return null;
  const ch = chToks.map((t, i) => channel(t, specs[i], env));
  if (ch.some((c) => !c)) return null;
  let alpha = defaultAlpha;
  if (slash >= 0) {
    const a = alphaValue(toks[slash + 1], env);
    if (!a) return null;
    alpha = a.value;
  }
  return { coords: ch.map((c) => c.value), alpha };
}

function legacyChannels(name, toks) {
  // v , v , v [, a]
  if (!(toks.length === 5 || toks.length === 7)) return null;
  for (let i = 1; i < toks.length; i += 2) if (toks[i] !== ',') return null;
  const vals = toks.filter((_, i) => i % 2 === 0);
  if (vals.includes('none')) return null;
  const fn = FUNCTIONS[name];
  const ch = vals.slice(0, 3).map((t, i) => channel(t, fn.ch[i], null));
  if (ch.some((c) => !c)) return null;
  if (fn.space === 'srgb') {
    const pct = ch.map((c) => c.unit === '%');
    if (pct.some((p) => p !== pct[0])) return null;
  } else if (ch[1].unit !== '%' || ch[2].unit !== '%') {
    return null;
  }
  let alpha = 1;
  if (vals.length === 4) {
    const a = alphaValue(vals[3], null);
    if (!a) return null;
    alpha = a.value;
  }
  return { coords: ch.map((c) => c.value), alpha };
}

function parseFunction(name, toks, opts) {
  const fn = FUNCTIONS[name];
  if (fn.legacy && toks.includes(',')) {
    const r = legacyChannels(name, toks);
    return r && { space: fn.space, coords: fn.finish(r.coords), alpha: r.alpha };
  }
  const rel = relativeOrigin(toks, opts);
  if (!rel) return null;
  const env = rel.origin && originEnv(rel.origin, fn.space, fn.keys, fn.toEnv);
  const r = modernChannels(rel.rest, fn.ch, env, env ? env.alpha : 1);
  return r && { space: fn.space, coords: fn.finish(r.coords), alpha: r.alpha };
}

function parseColorFunction(toks, opts) {
  const rel = relativeOrigin(toks, opts);
  if (!rel || !rel.rest.length) return null;
  const space = rel.rest[0];
  if (!PREDEFINED.includes(space)) return null;
  const keys = space.startsWith('xyz') ? ['x', 'y', 'z'] : ['r', 'g', 'b'];
  const env = rel.origin && originEnv(rel.origin, space, keys);
  const specs = [UNIT_CHANNEL, UNIT_CHANNEL, UNIT_CHANNEL];
  const r = modernChannels(rel.rest.slice(1), specs, env, env ? env.alpha : 1);
  return r && { space, coords: r.coords, alpha: r.alpha };
}

const MIX_SPACES = new Set([...PREDEFINED, 'lab', 'oklab', 'lch', 'oklch', 'hsl', 'hwb']);
const HUE_METHODS = new Set(['shorter', 'longer', 'increasing', 'decreasing']);

function parsePercent(tok) {
  const m = NUMBER_RE.exec(tok);
  if (m && m[2] === '%') return Number(m[1]);
  if (tok.startsWith('calc(')) {
    const q = quantity(tok, null);
    if (q && q.unit === '%') return q.value;
  }
  return null;
}

// color-mix(in <space> [<method> hue]?, <color> [<p>]?, <color> [<p>]?)
function parseColorMix(toks, opts) {
  const groups = [[]];
  for (const t of toks) {
    if (t === ',') groups.push([]);
    else groups[groups.length - 1].push(t);
  }
  let space = 'oklab', method = 'shorter';
  if (groups[0][0] === 'in') {
    const head = groups.shift();
    space = head[1];
    if (!MIX_SPACES.has(space)) return null;
    if (head.length === 4) {
      if (SPACES[space].hue === undefined) return null;
      if (!HUE_METHODS.has(head[2]) || head[3] !== 'hue') return null;
      method = head[2];
    } else if (head.length !== 2) {
      return null;
    }
  }
  if (groups.length !== 2) return null;
  const items = [];
  for (const g of groups) {
    if (g.length < 1 || g.length > 2) return null;
    let pct = null, colorTok = g[0];
    if (g.length === 2) {
      const p0 = parsePercent(g[0]), p1 = parsePercent(g[1]);
      if (p0 !== null) [pct, colorTok] = [p0, g[1]];
      else if (p1 !== null) pct = p1;
      else return null;
      if (pct < 0 || pct > 100) return null;
    }
    const color = parseRaw(colorTok, opts);
    if (!color) return null; // unresolvable operand → caller's fallback
    items.push({ color, pct });
  }
  let [p1, p2] = items.map((it) => it.pct);
  if (p1 === null && p2 === null) p1 = p2 = 50;
  else if (p1 === null) p1 = 100 - p2;
  else if (p2 === null) p2 = 100 - p1;
  const total = p1 + p2;
  if (total === 0) return null;
  return mixRaw(items[0].color, items[1].color, p2 / total, space, method, Math.min(total, 100) / 100);
}

function fixHues(h1, h2, method) {
  const d = h2 - h1;
  switch (method) {
    case 'longer':
      if (d > 0 && d < 180) h1 += 360;
      else if (d > -180 && d <= 0) h2 += 360;
      break;
    case 'increasing':
      if (d < 0) h2 += 360;
      break;
    case 'decreasing':
      if (d > 0) h1 += 360;
      break;
    default:
      if (d > 180) h1 += 360;
      else if (d < -180) h2 += 360;
  }
  return [h1, h2];
}

/**
 * Interpolate two raw colors in `space` (CSS Color 5 color-mix rules:
 * missing components take the other color's value, premultiplied alpha).
 * `t` is the weight of `b`; `alphaScale` < 1 when percentages sum below 100%.
 */
export function mixRaw(a, b, t, space = 'oklab', method = 'shorter', alphaScale = 1) {
  const ca = convert(a, space), cb = convert(b, space);
  const hueIdx = SPACES[space].hue;
  const pick = (x, y) => (Number.isNaN(x) ? y : x);
  const A = ca.coords.map((v, i) => pick(v, cb.coords[i]));
  const B = cb.coords.map((v, i) => pick(v, ca.coords[i]));
  const alphaA = pick(ca.alpha, cb.alpha), alphaB = pick(cb.alpha, ca.alpha);
  if (hueIdx !== undefined && !Number.isNaN(A[hueIdx])) {
    [A[hueIdx], B[hueIdx]] = fixHues(A[hueIdx], B[hueIdx], method);
  }
  const aA = Number.isNaN(alphaA) ? 1 : alphaA, aB = Number.isNaN(alphaB) ? 1 : alphaB;
  const alpha = aA + (aB - aA) * t;
  const coords = A.map((x, i) => {
    if (Number.isNaN(x)) return NaN;
    if (i === hueIdx) return normHue(x + (B[i] - x) * t);
    const v = x * aA + (B[i] * aB - x * aA) * t;
    return alpha === 0 ? v : v / alpha;
  });
  const outAlpha = Number.isNaN(alphaA) && Number.isNaN(alphaB) ? NaN : alpha * alphaScale;
  return { space, coords, alpha: outAlpha };
}

/**
 * Parse a CSS color into raw form `{ space, coords, alpha }` without
 * converting it. Missing components (`none`) are NaN.
 * Returns null when the input is invalid or can't be resolved statically
 * (var(), system colors, currentcolor without `opts.currentColor`).
 */
export function parseRaw(input, opts = {}) {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (s[0] === '#') return parseHex(s);
  const m = /^([a-z][a-z0-9-]*)\(([\s\S]*)\)$/.exec(s);
  if (!m) {
    if (s === 'transparent') return { space: 'srgb', coords: [0, 0, 0], alpha: 0 };
    if (s === 'currentcolor') {
      return opts.currentColor && !opts.inCurrentColor
        ? parseRaw(opts.currentColor, { ...opts, inCurrentColor: true })
        : null;
    }
    if (Object.hasOwn(NAMED_COLORS, s)) return parseHex('#' + NAMED_COLORS[s]);
    if (SYSTEM_COLORS.has(s)) return null;
    return null;
  }
  const [, name, body] = m;
  const toks = splitArgs(body);
  if (!toks) return null;
  if (Object.hasOwn(FUNCTIONS, name)) return parseFunction(name, toks, opts);
  if (name === 'color') return parseColorFunction(toks, opts);
  if (name === 'color-mix') return parseColorMix(toks, opts);
  if (name === 'light-dark') {
    if (toks.length !== 3 || toks[1] !== ',') return null;
    return parseRaw(opts.scheme === 'dark' ? toks[2] : toks[0], opts);
  }
  return null;
}

// ------------------------------------------------------------ gamut + API

const GAMUT_EPS = 1e-5;
const JND = 0.02;

export function inSrgbGamut({ r, g, b }) {
  return [r, g, b].every((v) => v >= -GAMUT_EPS && v <= 1 + GAMUT_EPS);
}

const clip01 = (v) => Math.min(1, Math.max(0, v));

function oklabOf(rgb) {
  return convert({ space: 'srgb', coords: rgb, alpha: 1 }, 'oklab').coords;
}

/** Euclidean distance between two OKLab coordinate triples. */
export function deltaEOK(lab1, lab2) {
  return Math.hypot(lab1[0] - lab2[0], lab1[1] - lab2[1], lab1[2] - lab2[2]);
}

/** CSS Color 4 gamut mapping: reduce OKLCH chroma until clipping is invisible. */
export function gamutMapOklch([L, C, h]) {
  const toRgb = (c) => convert({ space: 'oklch', coords: [L, c, h], alpha: 1 }, 'srgb').coords;
  if (L >= 1) return [1, 1, 1];
  if (L <= 0) return [0, 0, 0];
  let current = toRgb(C);
  if (inSrgbGamut({ r: current[0], g: current[1], b: current[2] })) return current.map(clip01);
  let lo = 0, hi = C, loInGamut = true;
  let clipped = current.map(clip01);
  if (deltaEOK(oklabOf(clipped), fromPolar([L, C, h])) < JND) return clipped;
  while (hi - lo > 0.0001) {
    const chroma = (lo + hi) / 2;
    current = toRgb(chroma);
    if (loInGamut && inSrgbGamut({ r: current[0], g: current[1], b: current[2] })) {
      lo = chroma;
      continue;
    }
    clipped = current.map(clip01);
    const e = deltaEOK(oklabOf(clipped), fromPolar([L, chroma, h]));
    if (e < JND) {
      if (JND - e < 0.0001) return clipped;
      loInGamut = false;
      lo = chroma;
    } else {
      hi = chroma;
    }
  }
  return clipped;
}

/** Raw color → displayable sRGB `{ r, g, b, alpha }` (0..1, gamut-mapped). */
export function toSrgb(raw) {
  const c = convert(raw, 'srgb');
  let rgb = c.coords.map((v) => (Number.isNaN(v) ? 0 : v));
  if (!inSrgbGamut({ r: rgb[0], g: rgb[1], b: rgb[2] })) {
    const lch = convert({ space: 'srgb', coords: rgb, alpha: 1 }, 'oklch').coords;
    rgb = gamutMapOklch(lch.map((v) => (Number.isNaN(v) ? 0 : v)));
  } else {
    rgb = rgb.map(clip01);
  }
  const alpha = Number.isNaN(c.alpha) ? 0 : c.alpha;
  return { r: rgb[0], g: rgb[1], b: rgb[2], alpha };
}

/**
 * Parse any CSS color to sRGB `{ r, g, b, alpha }` with channels in 0..1.
 * opts.currentColor: color string used for `currentcolor`.
 * opts.scheme: 'light' (default) or 'dark', for light-dark().
 * opts.fallback: returned when the color can't be parsed or resolved
 * (e.g. a color-mix() with a var() or unresolvable operand). Default null.
 */
export function parseColor(input, opts = {}) {
  const raw = parseRaw(input, opts);
  return raw ? toSrgb(raw) : opts.fallback ?? null;
}

const asColor = (c) => (typeof c === 'string' ? parseColor(c) : c);

/** sRGB `{r,g,b,alpha}` → OKLCH `{ l, c, h, alpha }`; achromatic hue is 0. */
export function srgbToOklch(color) {
  const { r, g, b, alpha = 1 } = color;
  const [l, c, h] = convert({ space: 'srgb', coords: [r, g, b], alpha }, 'oklch').coords;
  return { l, c, h: Number.isNaN(h) ? 0 : h, alpha };
}

/** OKLCH `{ l, c, h, alpha }` → sRGB `{r,g,b,alpha}`, gamut-mapped into sRGB. */
export function oklchToSrgb({ l, c, h, alpha = 1 }) {
  return toSrgb({ space: 'oklch', coords: [l, c, h], alpha });
}

/** Source-over composite of `fg` on `bg` (both sRGB objects). */
export function composite(fg, bg) {
  const a = fg.alpha ?? 1, ab = bg.alpha ?? 1;
  const alpha = a + ab * (1 - a);
  if (alpha === 0) return { r: 0, g: 0, b: 0, alpha: 0 };
  const ch = (f, b) => (f * a + b * ab * (1 - a)) / alpha;
  return { r: ch(fg.r, bg.r), g: ch(fg.g, bg.g), b: ch(fg.b, bg.b), alpha };
}

const WHITE = { r: 1, g: 1, b: 1, alpha: 1 };

/** WCAG 2.x relative luminance of an sRGB color. */
export function relativeLuminance(color) {
  const { r, g, b } = asColor(color);
  const lin = (v) => srgbToLinear(clip01(v));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * WCAG 2.x contrast ratio (1..21) of text `fg` on background `bg`.
 * Accepts color strings or sRGB objects. A translucent background is
 * composited on white (the canvas), then the text on that background.
 * Returns NaN when either color can't be parsed.
 */
export function contrastRatio(fg, bg) {
  const f = asColor(fg), b = asColor(bg);
  if (!f || !b) return NaN;
  const back = (b.alpha ?? 1) < 1 ? composite(b, WHITE) : b;
  const front = (f.alpha ?? 1) < 1 ? composite(f, back) : f;
  const l1 = relativeLuminance(front), l2 = relativeLuminance(back);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// The epsilon keeps exact halves (e.g. hsl(0 0% 50%) → 127.5) from rounding
// down when float error lands them at 127.49999…; CSS serializes them as 128.
const byte = (v) => Math.round(clip01(v) * 255 + 1e-9);

/** sRGB object → `rgb(r g b)` / `rgb(r g b / a)` with 8-bit channels. */
export function formatRgb({ r, g, b, alpha = 1 }) {
  const rgb = `${byte(r)} ${byte(g)} ${byte(b)}`;
  if (alpha >= 1) return `rgb(${rgb})`;
  return `rgb(${rgb} / ${Math.round(clip01(alpha) * 1000) / 1000})`;
}

/** sRGB object → `#rrggbb` or `#rrggbbaa`. */
export function formatHex({ r, g, b, alpha = 1 }) {
  const hex = (v) => byte(v).toString(16).padStart(2, '0');
  return '#' + hex(r) + hex(g) + hex(b) + (alpha < 1 ? hex(alpha) : '');
}
