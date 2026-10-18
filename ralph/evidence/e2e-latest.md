# Runner e2e (2026-10-18T05:05:30Z, HEAD 1871816): exit 1
Full log: ralph/evidence/e2e-latest.log

ℹ fail 1
ℹ pass 36
ℹ tests 37
✔ already-dark: every text node ≥ 4.5:1, buttons clickable, left as authored (3492.716333ms)
✔ already-dark: first paint is not white (16533.754375ms)
✔ cross-origin: every text node ≥ 4.5:1, buttons clickable (1723.749917ms)
✔ cross-origin: first paint is not white (16522.125084ms)
✔ cross-origin: renders dark, readable, and nothing intercepts pointer events (3464.309167ms)
✔ dynamic engine: images "dim" dims media; "hide background images" hides url() backgrounds (1732.75175ms)
✔ dynamic engine: media untouched by default (1703.93375ms)
✔ filter engine: images "dim" dims media; "hide background images" hides url() backgrounds (1747.021208ms)
✔ filter engine: page dark, media as authored (not inverted, not double-inverted), nothing intercepts clicks (3774.201292ms)
✔ hard-cases: every text node ≥ 4.5:1, buttons clickable (4793.424958ms)
✔ hard-cases: first paint is not white (16589.772542ms)
✔ images: every text node ≥ 4.5:1, buttons clickable (1733.875791ms)
✔ images: first paint is not white (16477.309667ms)
✔ inline: every text node ≥ 4.5:1, buttons clickable (1724.162208ms)
✔ inline: first paint is not white (16536.538ms)
✔ inline: renders dark, readable, and nothing intercepts pointer events (3479.875875ms)
✔ light: every text node ≥ 4.5:1, buttons clickable (1749.103958ms)
✔ light: first paint is not white (16783.976375ms)
✔ light: renders dark, readable, and nothing intercepts pointer events (4450.796583ms)
✔ links: every text node ≥ 4.5:1, buttons clickable (1775.63ms)
✔ links: first paint is not white (16476.633666ms)
✔ links: renders dark, readable, and nothing intercepts pointer events (3472.843167ms)
✔ options page: named remove buttons, keyboard pass, Reset dialog focus (539.024709ms)
✔ per-site engine switches dynamic → filter → dynamic without a reload (1784.211375ms)
✔ popup on a normal page: site controls, keyboard pass, rule saved from the keyboard (715.45375ms)
✔ popup on a restricted page: no site controls, says why (502.507375ms)
✔ popup on an already-dark page shows the note and the override (236.0205ms)
✔ shadow: every text node ≥ 4.5:1, buttons clickable (2050.430833ms)
✔ shadow: first paint is not white (16454.822167ms)
✔ shadow: renders dark, readable, and nothing intercepts pointer events (4082.599708ms)
✔ shop: every text node ≥ 4.5:1, buttons clickable (1805.612334ms)
✔ shop: first paint is not white (16535.638916ms)
✔ shop: renders dark, readable, and nothing intercepts pointer events (3471.119667ms)
✔ spa: every text node ≥ 4.5:1, buttons clickable (2302.217125ms)
✔ spa: first paint is not white (16494.247292ms)
✔ spa: renders dark, readable, and nothing intercepts pointer events (4669.291959ms)
✖ T013 perf budget: 5,000-node page and product-grid storm (26052.063084ms)

## First failure details
✖ failing tests:

test at e2e/perf.test.js:9:1
✖ T013 perf budget: 5,000-node page and product-grid storm (26052.063084ms)
  AssertionError [ERR_ASSERTION]: gridStormRafGapMax: 57 > 32
      at TestContext.<anonymous> (file:///Users/harrison/projects/sunglasses-at-night/e2e/perf.test.js:12:58)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }
