# Runner e2e (2026-10-19T05:45:31Z, HEAD f998c20): exit 1
Full log: ralph/evidence/e2e-latest.log

ℹ fail 1
ℹ pass 109
ℹ tests 110
✔ already-dark: every text node ≥ 4.5:1, buttons clickable, left as authored (3440.354ms)
✔ already-dark: first paint is not white (16472.164375ms)
✔ already-dark: system dark, mode always, settings read 300 ms: no white frame before settings arrive (1508.612ms)
✔ already-dark: system light, mode off: no dark frame at all (957.087541ms)
✔ amazon-home: photos, headlines and the late carousel (system dark, mode always) (3731.86475ms)
✔ amazon-home: the unmodified page is the reference (blend multiply, white headlines, light page) (2723.050875ms)
✔ concept a @ 1440x900 (715.773833ms)
✔ concept a @ 390x844 (209.482834ms)
✔ concept a @ 390x844-off (188.688833ms)
✔ concept a @ 390x844-restricted (207.441208ms)
✔ concept b @ 1440x900 (202.441542ms)
✔ concept b @ 390x844 (182.252917ms)
✔ concept b @ 390x844-off (184.415209ms)
✔ concept b @ 390x844-restricted (181.677333ms)
✔ concept c @ 1440x900 (201.785625ms)
✔ concept c @ 390x844 (189.993916ms)
✔ concept c @ 390x844-off (190.588708ms)
✔ concept c @ 390x844-restricted (177.168542ms)
✔ cross-origin: every text node ≥ 4.5:1, buttons clickable (1691.980791ms)
✔ cross-origin: first paint is not white (16453.304166ms)
✔ cross-origin: renders dark, readable, and nothing intercepts pointer events (3450.710292ms)
✔ cross-origin: system dark, mode always, settings read 300 ms: no white frame before settings arrive (1496.122917ms)
✔ cross-origin: system dark, mode off: transient dark ≤ settings read + 1 frame, then as authored (989.231125ms)
✔ cross-origin: system light, mode off: no dark frame at all (1166.358625ms)
✔ dynamic engine: images "dim" dims media; "hide background images" hides url() backgrounds (1731.84925ms)
✔ dynamic engine: media untouched by default (1730.140958ms)
✔ filter engine: images "dim" dims media; "hide background images" hides url() backgrounds (1744.303125ms)
✔ filter engine: page dark, media as authored (not inverted, not double-inverted), nothing intercepts clicks (3740.155958ms)
✔ fresh-grid: dynamic engine, images dim: photos and "+" icons are not blacked out (7834.090459ms)
✔ fresh-grid: dynamic engine, images leave: photos and "+" icons are not blacked out (7808.1435ms)
✔ fresh-grid: dynamic engine, images no-invert: photos and "+" icons are not blacked out (7805.010833ms)
✔ fresh-grid: filter engine, images dim: photos and "+" icons are not blacked out (8045.526375ms)
✔ fresh-grid: filter engine, images leave: photos and "+" icons are not blacked out (7842.900042ms)
✔ fresh-grid: filter engine, images no-invert: photos and "+" icons are not blacked out (7849.038833ms)
✔ fresh-grid: the unmodified page is the reference (12 tiles, both tints multiply) (8040.361ms)
✔ hard-cases: every text node ≥ 4.5:1, buttons clickable (4635.457709ms)
✔ hard-cases: first paint is not white (16502.0225ms)

## First failure details
✖ failing tests:

test at e2e/perf.test.js:9:1
✖ T013 perf budget: 5,000-node page and product-grid storm (59185.143209ms)
  AssertionError [ERR_ASSERTION]: nodesBatchMedian: 10.5 > 8
      at TestContext.<anonymous> (file:///Users/harrison/projects/sunglasses-at-night/e2e/perf.test.js:12:75)
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
