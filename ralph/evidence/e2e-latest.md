# Runner e2e (2026-10-18T06:31:47Z, HEAD 3e86fa6): exit 1
Full log: ralph/evidence/e2e-latest.log

ℹ fail 1
ℹ pass 38
ℹ tests 39
✔ already-dark: every text node ≥ 4.5:1, buttons clickable, left as authored (3415.27925ms)
✔ already-dark: first paint is not white (16369.473541ms)
✔ cross-origin: every text node ≥ 4.5:1, buttons clickable (1671.897334ms)
✔ cross-origin: first paint is not white (16372.554375ms)
✔ cross-origin: renders dark, readable, and nothing intercepts pointer events (3374.527ms)
✔ dynamic engine: images "dim" dims media; "hide background images" hides url() backgrounds (1704.859292ms)
✔ dynamic engine: media untouched by default (1689.304709ms)
✔ filter engine: images "dim" dims media; "hide background images" hides url() backgrounds (1706.3145ms)
✔ filter engine: page dark, media as authored (not inverted, not double-inverted), nothing intercepts clicks (3637.965084ms)
✔ hard-cases: every text node ≥ 4.5:1, buttons clickable (4610.965708ms)
✔ hard-cases: first paint is not white (16459.888125ms)
✔ images: every text node ≥ 4.5:1, buttons clickable (1696.307375ms)
✔ images: first paint is not white (16417.231292ms)
✔ inline: every text node ≥ 4.5:1, buttons clickable (1691.521417ms)
✔ inline: first paint is not white (16363.876917ms)
✔ inline: renders dark, readable, and nothing intercepts pointer events (3372.87675ms)
✔ light: every text node ≥ 4.5:1, buttons clickable (1706.49575ms)
✔ light: first paint is not white (16603.146625ms)
✔ light: renders dark, readable, and nothing intercepts pointer events (3729.161375ms)
✔ links: every text node ≥ 4.5:1, buttons clickable (1672.12625ms)
✔ links: first paint is not white (16386.712208ms)
✔ links: renders dark, readable, and nothing intercepts pointer events (3397.59ms)
✔ options page: named remove buttons, keyboard pass, Reset dialog focus (435.714167ms)
✔ per-site engine switches dynamic → filter → dynamic without a reload (1728.946792ms)
✔ popup in Safari: tab.url undefined, host comes from the stored report (143.715917ms)
✔ popup on a normal page: site controls, keyboard pass, rule saved from the keyboard (589.039958ms)
✔ popup on a restricted page: no site controls, says why (425.920875ms)
✔ popup on an already-dark page shows the note and the override (179.313125ms)
✔ popup with no tab.url and no stored host is restricted (138.063209ms)
✔ shadow: every text node ≥ 4.5:1, buttons clickable (1998.608333ms)
✔ shadow: first paint is not white (16450.304083ms)
✔ shadow: renders dark, readable, and nothing intercepts pointer events (3942.924958ms)
✔ shop: every text node ≥ 4.5:1, buttons clickable (1763.50575ms)
✔ shop: first paint is not white (16375.93275ms)
✔ shop: renders dark, readable, and nothing intercepts pointer events (3438.582333ms)
✔ spa: every text node ≥ 4.5:1, buttons clickable (2286.047625ms)
✔ spa: first paint is not white (16367.632541ms)

## First failure details
✖ failing tests:

test at e2e/perf.test.js:9:1
✖ T013 perf budget: 5,000-node page and product-grid storm (25524.990625ms)
  AssertionError [ERR_ASSERTION]: gridStormRafGapMax: 41 > 32
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
