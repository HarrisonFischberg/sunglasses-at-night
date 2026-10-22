# Dark Reader (third-party, MIT)

Source: https://github.com/darkreader/darkreader at commit `fda0590`
(2026-10-20), version 4.9.133. License: `LICENSE` in this folder (MIT,
Copyright (c) Dark Reader Ltd.).

What we use:

- `dark-sites.config`: sites that are dark by design; Sunglasses leaves them
  alone when "Detect dark sites" is on.
- `dynamic-theme-fixes.config`: per-site corrections (INVERT selectors, extra
  CSS, IGNORE INLINE STYLE).
- `engine/src/site-fixes.js` ports Dark Reader's config parser and URL
  pattern matcher (`src/generators/utils/parse.ts`, `src/utils/url.ts`).

To update: copy the two config files from a newer checkout, update the commit
above, and run `node engine/scripts/site-data.js`.
