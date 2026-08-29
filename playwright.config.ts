import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration for the Phase 1 exit gate.
 *
 * Authority: PRD 13 ("crawlable and keyboard-usable without client catalog
 * code"), 9.7 (degraded modes), 10.1 (accessibility), 11.1 (E2E across
 * Chromium, Firefox and WebKit).
 *
 * Two projects, and the split is the point:
 *
 *   chromium   normal browser, for axe and keyboard journeys
 *   no-js      javaScriptEnabled: false — the literal exit-gate condition
 *
 * The suite runs against the STATIC EXPORT served as plain files, not against
 * `next dev`. A dev server can paper over export-only failures, and the export
 * is what actually ships.
 *
 * PRD 11.1 also asks for Firefox and WebKit. Chromium is wired here because it
 * is what CI installs today; adding the other two is a config change and a
 * longer install, tracked for Phase 5 hardening.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["list"]] : [["list"]],

  /**
   * Ten seconds, not Playwright's default five.
   *
   * From Phase 3 on, most assertions wait on real network work: the lazy
   * palette chunk, a 314 KB search index, catalog-core and the facet bitsets —
   * fetched by four parallel workers from one static file server. At five
   * seconds this suite failed roughly one run in eight, always on a
   * `toBeVisible` that was waiting for a fetch rather than on a real defect.
   *
   * This is a bound on how long a fetch may take, not a way to let a broken
   * page pass: a genuinely hung page still fails, ten seconds later.
   */
  expect: { timeout: 10_000 },

  use: {
    baseURL: "http://127.0.0.1:4321",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Perf specs are excluded here: they are timing-sensitive and would
      // measure contention rather than the page if run in parallel with the
      // rest of the suite.
      testIgnore: [/\.nojs\.spec\.ts$/, /\.perf\.spec\.ts$/],
    },
    {
      /**
       * Runtime budgets. One worker, no parallelism, run on demand via
       * `pnpm measure:runtime` — never as part of `pnpm test:e2e`.
       */
      name: "perf",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\.perf\.spec\.ts$/,
      fullyParallel: false,
      workers: 1,
      retries: 0,
    },
    {
      name: "no-js",
      use: { ...devices["Desktop Chrome"], javaScriptEnabled: false },
      testMatch: /\.nojs\.spec\.ts$/,
    },
  ],

  webServer: {
    // No `--single`. SPA fallback would serve index.html for every unmatched
    // path, so a broken route would look like a working one - which is exactly
    // how this suite first passed a 200 while rendering the wrong page.
    command: "pnpm exec serve apps/web/out --listen 4321 --no-clipboard",
    url: "http://127.0.0.1:4321",
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
