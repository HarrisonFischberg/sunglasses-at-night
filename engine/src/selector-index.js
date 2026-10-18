// Sunglasses for Safari: dead-selector index (T024).
// An override rule whose selector can't match anything on the page still costs
// the browser a rule-set entry on every style recalc. The page's own sheets
// are full of such rules (a store ships thousands of selectors for pages it
// isn't showing), so the engine leaves them out of the override sheet and puts
// them back the moment the page grows the class, id or tag they need.
//
// Soundness: a selector is dead only when one of its required tokens (a class,
// an id or a tag name written at the top level of a compound selector) is in
// no element the page has had. Anything the parser can't reason about (escapes,
// namespaces, nesting `&`) is never dead. Tokens inside parentheses
// (:not(), :is(), :has(), ::slotted() …) are not required, attribute selectors
// and pseudo-classes add nothing, and every token is lower-cased, so quirks
// mode's case-insensitive matching can only make us keep more rules. The set of
// seen tokens only grows, so a rule is dead until a token appears, never again.
// Pure: no DOM, no network.

const MAX_PARSED = 50000;

const isIdentChar = (code) =>
  (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) ||
  code === 45 || code === 95 || code > 127;

const parsed = new Map();

/**
 * The tokens each comma-separated part of `selectorText` requires:
 * an array (one entry per part) of token arrays (`.class`, `#id`, `<tag`), or
 * null when the selector can't be reasoned about.
 */
export function requiredTokens(selectorText) {
  if (typeof selectorText !== 'string') return null;
  if (parsed.has(selectorText)) return parsed.get(selectorText);
  const out = parseSelector(selectorText);
  if (parsed.size >= MAX_PARSED) parsed.clear();
  parsed.set(selectorText, out);
  return out;
}

function parseSelector(s) {
  const groups = [[]];
  const n = s.length;
  let i = 0, depth = 0, atCompoundStart = true;
  const ident = () => {
    const start = i;
    while (i < n && isIdentChar(s.charCodeAt(i))) i++;
    return s.slice(start, i).toLowerCase();
  };
  while (i < n) {
    const ch = s[i];
    if (ch === '\\' || ch === '&' || ch === '|') return null;
    if (ch === '"' || ch === "'") {
      i++;
      while (i < n && s[i] !== ch) i += s[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    if (ch === '(') {
      depth++;
      i++;
      continue;
    }
    if (ch === ')') {
      if (--depth < 0) return null;
      i++;
      continue;
    }
    if (depth > 0) {
      i++;
      continue;
    }
    if (ch === '[') {
      i++;
      while (i < n && s[i] !== ']') {
        if (s[i] === '"' || s[i] === "'") {
          const q = s[i++];
          while (i < n && s[i] !== q) i += s[i] === '\\' ? 2 : 1;
        }
        i++;
      }
      i++;
      atCompoundStart = false;
      continue;
    }
    if (ch === ',') {
      groups.push([]);
      i++;
      atCompoundStart = true;
      continue;
    }
    if (ch === ' ' || ch === '>' || ch === '+' || ch === '~' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f') {
      i++;
      atCompoundStart = true;
      continue;
    }
    const group = groups[groups.length - 1];
    if (ch === '.' || ch === '#') {
      i++;
      const name = ident();
      if (!name) return null;
      group.push(ch + name);
    } else if (ch === ':') {
      i++;
      if (s[i] === ':') i++;
      if (!ident()) return null;
    } else if (ch === '*') {
      i++;
    } else if (isIdentChar(s.charCodeAt(i))) {
      const name = ident();
      if (atCompoundStart && !/^[0-9-]/.test(name)) group.push('<' + name);
    } else {
      return null;
    }
    atCompoundStart = false;
  }
  return depth === 0 ? groups : null;
}

/**
 * Track the classes, ids and tag names a page has had, and which selectors
 * can't match yet. `onRevive()` runs when a dead selector may match again;
 * the caller then rewrites the sheets that left it out.
 */
export function createSelectorIndex(onRevive = () => {}) {
  const tokens = new Set();
  const dead = new Set();
  const waiting = new Map(); // token → selectors that need it

  function isDead(selectorText) {
    if (dead.has(selectorText)) return true;
    const groups = requiredTokens(selectorText);
    if (!groups) return false;
    const missing = [];
    for (const group of groups) {
      const m = group.find((t) => !tokens.has(t));
      if (m === undefined) return false;
      missing.push(m);
    }
    dead.add(selectorText);
    for (const m of missing) {
      let set = waiting.get(m);
      if (!set) waiting.set(m, (set = new Set()));
      set.add(selectorText);
    }
    return true;
  }

  function add(token) {
    if (tokens.has(token)) return;
    tokens.add(token);
    const set = waiting.get(token);
    if (!set) return;
    waiting.delete(token);
    let revived = false;
    for (const sel of set) {
      if (!dead.has(sel)) continue;
      dead.delete(sel);
      if (!isDead(sel)) revived = true;
    }
    if (revived) onRevive();
  }

  /** Record one element's tag, id and classes. */
  function addElement(el) {
    add('<' + el.localName.toLowerCase());
    const id = el.getAttribute('id');
    if (id) add('#' + id.toLowerCase());
    const cls = el.getAttribute('class');
    if (cls) {
      for (const c of cls.split(/\s+/)) if (c) add('.' + c.toLowerCase());
    }
  }

  return { isDead, add, addElement, has: (t) => tokens.has(t), deadCount: () => dead.size };
}
