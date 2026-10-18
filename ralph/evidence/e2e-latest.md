# Runner e2e (2026-10-18T04:28:34Z, HEAD 2a8ec48): exit 1
Full log: ralph/evidence/e2e-latest.log

ℹ fail 1
ℹ pass 36
ℹ tests 37
✔ already-dark: every text node ≥ 4.5:1, buttons clickable, left as authored (3411.705375ms)
✔ already-dark: first paint is not white (16492.106792ms)
✔ cross-origin: every text node ≥ 4.5:1, buttons clickable (1717.748292ms)
✔ cross-origin: first paint is not white (16436.070916ms)
✔ cross-origin: renders dark, readable, and nothing intercepts pointer events (3361.760083ms)
✔ dynamic engine: images "dim" dims media; "hide background images" hides url() backgrounds (1691.910042ms)
✔ dynamic engine: media untouched by default (1716.882125ms)
✔ filter engine: images "dim" dims media; "hide background images" hides url() backgrounds (1706.268041ms)
✔ filter engine: page dark, media as authored (not inverted, not double-inverted), nothing intercepts clicks (3669.050958ms)
✔ hard-cases: every text node ≥ 4.5:1, buttons clickable (4718.595541ms)
✔ hard-cases: first paint is not white (16542.366ms)
✔ images: every text node ≥ 4.5:1, buttons clickable (1711.090292ms)
✔ images: first paint is not white (16486.941375ms)
✔ inline: every text node ≥ 4.5:1, buttons clickable (1677.607292ms)
✔ inline: first paint is not white (16492.341916ms)
✔ inline: renders dark, readable, and nothing intercepts pointer events (3390.017583ms)
✔ light: every text node ≥ 4.5:1, buttons clickable (1681.341625ms)
✔ light: first paint is not white (16612.009458ms)
✔ light: renders dark, readable, and nothing intercepts pointer events (4045.037917ms)
✔ links: every text node ≥ 4.5:1, buttons clickable (1705.748917ms)
✔ links: first paint is not white (16378.81725ms)
✔ links: renders dark, readable, and nothing intercepts pointer events (3389.975875ms)
✔ options page: named remove buttons, keyboard pass, Reset dialog focus (498.948375ms)
✔ per-site engine switches dynamic → filter → dynamic without a reload (1746.277666ms)
✔ popup on a normal page: site controls, keyboard pass, rule saved from the keyboard (657.937125ms)
✔ popup on a restricted page: no site controls, says why (467.818667ms)
✔ popup on an already-dark page shows the note and the override (188.737167ms)
✔ shadow: every text node ≥ 4.5:1, buttons clickable (1993.660834ms)
✔ shadow: first paint is not white (16457.699667ms)
✔ shadow: renders dark, readable, and nothing intercepts pointer events (3958.164875ms)
✔ shop: every text node ≥ 4.5:1, buttons clickable (1762.281208ms)
✔ shop: first paint is not white (16502.131125ms)
✔ shop: renders dark, readable, and nothing intercepts pointer events (3467.304083ms)
✔ spa: every text node ≥ 4.5:1, buttons clickable (2285.782667ms)
✔ spa: first paint is not white (16485.453042ms)
✔ spa: renders dark, readable, and nothing intercepts pointer events (4566.603958ms)
✖ T013 perf budget: 5,000-node page and product-grid storm (25544.15ms)

## First failure details
✖ failing tests:

test at e2e/perf.test.js:9:1
✖ T013 perf budget: 5,000-node page and product-grid storm (25544.15ms)
  AssertionError [ERR_ASSERTION]: gridStormRafGapMax: 47 > 32
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
