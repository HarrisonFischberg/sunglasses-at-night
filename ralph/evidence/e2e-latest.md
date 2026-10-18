# Runner e2e (2026-10-18T03:04:30Z, HEAD 3dd86e4): exit 1
Full log: ralph/evidence/e2e-latest.log

ℹ fail 1
ℹ pass 15
ℹ tests 16
✔ cross-origin: renders dark, readable, and nothing intercepts pointer events (3434.4405ms)
✔ dynamic engine: images "dim" dims media; "hide background images" hides url() backgrounds (1710.050625ms)
✔ dynamic engine: media untouched by default (1713.380417ms)
✔ filter engine: images "dim" dims media; "hide background images" hides url() backgrounds (1723.962ms)
✔ filter engine: page dark, media as authored (not inverted, not double-inverted), nothing intercepts clicks (3707.187542ms)
✔ inline: renders dark, readable, and nothing intercepts pointer events (3411.553875ms)
✔ light: renders dark, readable, and nothing intercepts pointer events (3918.975042ms)
✔ links: renders dark, readable, and nothing intercepts pointer events (3437.70575ms)
✔ options page: named remove buttons, keyboard pass, Reset dialog focus (444.886ms)
✔ per-site engine switches dynamic → filter → dynamic without a reload (1748.536834ms)
✔ popup on a restricted page: no site controls, says why (459.346334ms)
✔ popup on an already-dark page shows the note and the override (192.22925ms)
✔ shadow: renders dark, readable, and nothing intercepts pointer events (4027.275458ms)
✔ shop: renders dark, readable, and nothing intercepts pointer events (3483.340792ms)
✔ spa: renders dark, readable, and nothing intercepts pointer events (4633.136292ms)
✖ failing tests:
✖ popup on a normal page: site controls, keyboard pass, rule saved from the keyboard (412.723334ms)

## First failure details
✖ failing tests:

test at e2e/ui.test.js:111:1
✖ popup on a normal page: site controls, keyboard pass, rule saved from the keyboard (412.723334ms)
  AssertionError [ERR_ASSERTION]: icon button reachable and named
      at TestContext.<anonymous> (file:///Users/harrison/projects/sunglasses-at-night/e2e/ui.test.js:122:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }
