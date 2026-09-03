/**
 * Runtime budget harness.
 *
 * Authority: PRD 9.3 (`MOUNTED-ROWS-MAX`, `DOM-ARCHIVE-STEADY`), 5.3.3
 * (`FILTER-MEDIAN-1300`, `FILTER-P95-*`, `LONG-TASK-CEILING`), 5.2.3
 * (`SEARCH-QUERY-*`), 13 Phase 3 exit gate ("search/filter/DOM/a11y budgets
 * pass at 1,300 and soak at 10,000"), 12.2 (a budget is never raised to make
 * something pass).
 *
 * WHY THIS IS NOT scripts/measure-runtime.ts. It began as a standalone script
 * that launched its own browser and static server — and reimplemented, badly,
 * what playwright.config.ts already does correctly for 50 other tests. Running
 * it as a Playwright project deletes the browser lifecycle and web-server code
 * entirely.
 *
 * WHY IT IS NOT IN THE DEFAULT E2E RUN. These assertions are timing-sensitive
 * and meaningless unless the machine is otherwise idle; mixed into a
 * fullyParallel suite they would measure contention. The `perf` project runs
 * with one worker, on demand.
 *
 * Thresholds come from config/budgets.v1.json. Nothing is hard-coded, so
 * changing a budget stays a reviewed diff with an ADR behind it (PRD 12.2).
 *
 *   pnpm measure:runtime                   whatever is in apps/web/out
 *   ATLAS_AT=10000 pnpm measure:runtime    label the soak run
 *
 * The reporter is deliberately left to playwright.config.ts. Overriding it with
 * --reporter=list also suppressed the `github` reporter on CI, so a budget
 * failure produced no annotation — the measured value existed only in a log
 * that needs a token to read, which is the one place it is least useful.
 */

import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

interface Budget {
  id: string;
  value: number;
  unit: string;
  comparator: string;
}

const BUDGETS: ReadonlyMap<string, Budget> = new Map(
  (JSON.parse(readFileSync("config/budgets.v1.json", "utf8")) as { budgets: Budget[] }).budgets.map(
    (b) => [b.id, b],
  ),
);

/** Which scale the budgets are read at. The corpus in out/ decides the truth. */
const AT = process.env["ATLAS_AT"] === "10000" ? "10000" : "1300";

const report: string[] = [];

function limitOf(id: string): Budget {
  const budget = BUDGETS.get(id);
  if (budget === undefined) throw new Error(`no budget '${id}' in config/budgets.v1.json`);
  return budget;
}

/** Nearest-rank. Interpolation would imply precision these samples lack. */
function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))] ?? Number.NaN;
}

/**
 * Budget ids that are KNOWN to fail and are tracked rather than enforced.
 *
 * Comma-separated, from `ATLAS_ADVISORY_BUDGETS`. A budget named here still
 * runs, still reports its measured value, and still annotates the CI run — it
 * simply does not fail the build.
 *
 * Deliberately a named list rather than a blanket `continue-on-error` on the
 * job. Silencing the whole job would also silence a broken 1,300 corpus build
 * or a harness that recorded no samples, and the budget would then look
 * "tracked" while nothing was actually measuring it. Every budget not on this
 * list still fails hard, so a NEW regression still turns CI red.
 */
const ADVISORY: ReadonlySet<string> = new Set(
  (process.env["ATLAS_ADVISORY_BUDGETS"] ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== ""),
);

/**
 * One definition of "inside the budget", used by both the report and the
 * assertion.
 *
 * These were two expressions that disagreed: the report treated every
 * `<`-comparator as inclusive while the assertion honoured the strict `<` that
 * LONG-TASK-CEILING declares. A long task of exactly 50 ms printed PASS and
 * failed the build.
 */
function within(budget: Budget, measured: number): boolean {
  if (budget.comparator === "<") return measured < budget.value;
  if (budget.comparator.startsWith("<")) return measured <= budget.value;
  return measured >= budget.value;
}

function record(id: string, measured: number, note: string, status: string): void {
  const budget = limitOf(id);
  report.push(
    `  ${status.padEnd(5)} ${id.padEnd(20)} ` +
      `${String(Math.round(measured * 100) / 100).padStart(8)} / ${String(budget.value).padStart(6)} ${budget.unit}   ${note}`,
  );
}

/** A GitHub annotation, so an advisory result is visible without reading logs. */
function annotate(level: "warning" | "notice", title: string, message: string): void {
  if (process.env["CI"] === undefined) return;
  process.stdout.write(`::${level} title=${title}::${message}\n`);
}

/**
 * Record a measurement and assert it, in one call.
 *
 * Recording and asserting used to be two statements naming the same budget id,
 * which is one edit away from a summary line that disagrees with the assertion
 * beside it. This also puts the budget id into the failure message, so the CI
 * annotation says which budget broke and by how much rather than
 * "expected 52.6 to be <= 30".
 */
function check(id: string, measured: number, note: string): void {
  const budget = limitOf(id);
  const rounded = Math.round(measured * 100) / 100;
  const ok = within(budget, measured);
  const advisory = ADVISORY.has(id);

  if (ok) {
    record(id, measured, note, "PASS");
    if (advisory) {
      // The exemption has outlived the violation. Saying so is what stops a
      // list of "known failures" quietly becoming a list of things nobody
      // checks any more.
      annotate(
        "notice",
        `${id} now passes`,
        `${id} measured ${rounded} ${budget.unit} against a budget of ${budget.value} and is still listed in ATLAS_ADVISORY_BUDGETS. Remove it.`,
      );
      report.push(`         ^ now passes; remove ${id} from ATLAS_ADVISORY_BUDGETS`);
    }
    return;
  }

  const label = `${id}: ${rounded} ${budget.unit} against a budget of ${budget.value}`;

  if (advisory) {
    record(id, measured, note, "KNOWN");
    annotate("warning", `${id} exceeds its budget (known)`, `${label}. Tracked, not enforced.`);
    return;
  }

  record(id, measured, note, "FAIL");
  if (budget.comparator === "<") expect(measured, label).toBeLessThan(budget.value);
  else expect(measured, label).toBeLessThanOrEqual(budget.value);
}

/**
 * The dense row view, named explicitly.
 *
 * Phase 4 made the grid the default archive view (PRD 5.4.1), so a bare
 * `/projects` no longer renders rows. The row budgets still need measuring, so
 * the view is requested rather than assumed.
 */
async function ready(page: Page): Promise<number> {
  await page.goto("/projects?view=rows");
  await page.waitForSelector("html[data-catalog-active]", { state: "attached" });
  await page.waitForSelector(".row:not(.row--head)");
  return Number((await page.locator("[role='grid']").getAttribute("aria-rowcount")) ?? "1") - 1;
}

/** The default archive view: the grid. */
async function gridReady(page: Page): Promise<number> {
  await page.goto("/projects");
  await page.waitForSelector("html[data-catalog-active]", { state: "attached" });
  await page.waitForSelector(".card");
  return Number(
    (await page.locator("[role='list'][aria-label='Projects']").getAttribute("aria-rowcount")) ??
      "0",
  );
}

/** Expand the first N facet groups; their values mount only while open. */
async function openFacetGroups(page: Page, count: number): Promise<void> {
  const summaries = page.locator(".facet summary");
  const available = Math.min(await summaries.count(), count);
  for (let i = 0; i < available; i += 1) await summaries.nth(i).click();
  await page.locator(".facet input[type='checkbox']").first().waitFor();
}

/**
 * Run one query and wait for the worker to actually answer.
 *
 * The first query pays for the manifest fetch, the 314 KB index and Fuse
 * hydration, so a fixed delay either flakes or is far longer than every
 * subsequent query needs. This waits for the measure count to grow instead.
 */
async function query(page: Page, term: string, expected: number): Promise<void> {
  await page.locator("#catalog-q").fill(term);
  await page
    .waitForFunction(
      (n) => performance.getEntriesByName("atlas:search", "measure").length >= n,
      expected,
      { timeout: 20_000 },
    )
    .catch(() => {
      // Reported by the sample-count assertion, which names the problem better
      // than a bare timeout would.
    });
}

async function measures(page: Page, name: string): Promise<number[]> {
  return page.evaluate(
    (entry) => performance.getEntriesByName(entry, "measure").map((e) => e.duration),
    name,
  );
}

/**
 * A line in the report that carries a number but has no budget behind it.
 *
 * Annotated as well as reported, for the same reason `--reporter=list` was
 * removed: the summary is printed to a job log that needs a token to read, so a
 * diagnostic that lives only there is least useful exactly when someone is
 * trying to understand a failure. These are the numbers that explain the
 * budgeted ones — how much of a search was ranking, how much of a paint was
 * waiting for a frame — and a notice is collapsed by default, so surfacing them
 * costs nothing.
 */
function note(label: string, value: string): void {
  report.push(`  ----  ${label.padEnd(20)} ${value}`);
  annotate("notice", label, value);
}

/**
 * Shared by the busy and idle runs, so the two p95s are comparable.
 *
 * Twenty terms run twice. Nearest-rank over eight samples puts p95 at the
 * maximum — always the cold first query — so a short list measures startup
 * rather than steady-state, and comparing an 8-sample p95 with a 40-sample one
 * compares nothing.
 */
const SEARCH_TERMS: readonly string[] = [
  "agent",
  "api",
  "data",
  "graph",
  "rag",
  "queue",
  "index",
  "model",
  "cache",
  "stream",
  "vector",
  "eval",
  "deploy",
  "trace",
  "auth",
  "sql",
  "react",
  "node",
  "python",
  "rust",
];

/** The same queries, driven through the palette on an otherwise idle page. */
async function queryViaPalette(page: Page, terms: readonly string[]): Promise<void> {
  await page.goto("/");
  await page.waitForSelector("html[data-palette-ready]", { state: "attached" });
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator("#palette-input").waitFor();

  let n = 0;
  for (const term of terms) {
    await page.locator("#palette-input").fill(term);
    n += 1;
    await page
      .waitForFunction(
        (count) => performance.getEntriesByName("atlas:search", "measure").length >= count,
        n,
        { timeout: 20_000 },
      )
      .catch(() => {
        // Reported by the sample-count assertion in the caller.
      });
  }
}

test.afterAll(() => {
  if (report.length === 0) return;

  const known = report.filter((line) => line.trimStart().startsWith("KNOWN"));
  const lines = [`\nRuntime budgets @ ${AT}\n`, ...report];

  if (known.length > 0) {
    // A green run that contains an exceeded budget must say so in the place
    // someone actually looks. Without this the job passes and the summary
    // scrolls by, which is how a tracked violation becomes a forgotten one.
    lines.push(
      "",
      `  ${known.length} budget(s) exceeded but NOT enforced, via ATLAS_ADVISORY_BUDGETS.`,
      "  These are tracked, not fixed. The job is green because they are named,",
      "  not because they pass.",
    );
  }

  process.stdout.write(`${lines.join("\n")}\n\n`);
});

test.describe("runtime budgets", () => {
  test("DOM stays bounded while scrolling the whole catalog", async ({ page }) => {
    const total = await ready(page);
    /**
     * The corpus must match the scale being claimed.
     *
     * This was `> 100`, which a 240-record build satisfies — so a fixture build
     * that silently failed left the harness measuring the real catalog while
     * reporting `@1300` budgets. Every number was honest about itself and wrong
     * about what it described.
     */
    const expected = AT === "10000" ? 9000 : 1000;
    expect(
      total,
      `apps/web/out holds ${total} projects; ATLAS_AT=${AT} needs a corpus of at least ${expected}. Rebuild with ATLAS_FIXTURE.`,
    ).toBeGreaterThan(expected);

    let worstRows = 0;
    let worstDom = 0;
    for (let i = 0; i < 12; i += 1) {
      await page.mouse.wheel(0, 4000);
      await page.waitForTimeout(90);
      worstRows = Math.max(worstRows, await page.locator(".row:not(.row--head)").count());
      worstDom = Math.max(
        worstDom,
        await page.evaluate(() => document.querySelectorAll("*").length),
      );
    }
    check("MOUNTED-ROWS-MAX", worstRows, `worst of 12 scroll steps, ${total} projects`);
  });

  test("the grid stays bounded while scrolling", async ({ page }) => {
    /**
     * `DOM-ARCHIVE-STEADY` is measured HERE rather than on the row view,
     * because the grid is what a visitor gets by default (PRD 5.4.1) and its
     * cards carry far more DOM per item than a row does. Measuring the cheaper
     * view and calling the budget met would be measuring the wrong page.
     */
    await gridReady(page);

    // Which card is first, before scrolling. A mounted-card count is only
    // meaningful if the window actually moved: a virtualizer that never
    // recycled would report a small number and pass the budget while proving
    // nothing.
    const firstBefore = await page.locator(".card").first().getAttribute("data-ordinal");

    // The list scrolls, not the page, so the wheel has to be over it.
    await page.locator(".grid").hover();

    let worstCards = 0;
    let worstDom = 0;
    for (let i = 0; i < 12; i += 1) {
      await page.mouse.wheel(0, 4000);
      await page.waitForTimeout(90);
      worstCards = Math.max(worstCards, await page.locator(".card").count());
      worstDom = Math.max(
        worstDom,
        await page.evaluate(() => document.querySelectorAll("*").length),
      );
    }

    const firstAfter = await page.locator(".card").first().getAttribute("data-ordinal");
    expect(firstAfter, "scrolling never moved the virtualized window").not.toBe(firstBefore);

    check("MOUNTED-CARDS-MAX", worstCards, "worst of 12 scroll steps");
    check("DOM-ARCHIVE-STEADY", worstDom, "grid view, worst of 12 scroll steps");
  });

  test("media causes no layout shift, and no backdrop blur stacks up", async ({ page }) => {
    /**
     * `MEDIA-LAYOUT-SHIFT` is 0. At 1,300 records every fixture card image
     * 404s, which makes this a HARDER test than one where images load: an
     * image that never arrives must still move nothing, which is only true if
     * the frame reserved its box up front.
     */
    await page.addInitScript(() => {
      const w = window as unknown as { __mediaShift: number };
      w.__mediaShift = 0;
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
              sources?: { node?: Node | null }[];
            };
            if (shift.hadRecentInput) continue;
            const fromMedia = (shift.sources ?? []).some((source) => {
              const node = source.node;
              return node instanceof Element && node.closest(".card__media") !== null;
            });
            if (fromMedia) w.__mediaShift += shift.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
      } catch {
        // Layout Instability unavailable; reported as zero SAMPLES below.
      }
    });

    await gridReady(page);
    for (let i = 0; i < 6; i += 1) {
      await page.mouse.wheel(0, 3000);
      await page.waitForTimeout(120);
    }

    const shift = await page.evaluate(
      () => (window as unknown as { __mediaShift: number }).__mediaShift,
    );
    check("MEDIA-LAYOUT-SHIFT", shift, "attributed to .card__media, 6 scroll steps");

    /**
     * PRD 9.3, raised to 10 by ADR 0036 for the desktop's glass chrome.
     *
     * Counted on `/` as well as here, and `/` is the number that matters: the
     * archive holds ONE window, so it is now the cheapest route on the site,
     * while home splits into four and is the worst case. Measuring only the
     * archive would have reported a comfortable 3 for a page that never
     * approaches the budget, and left the one that does unmeasured.
     *
     * Every element is counted, hidden ones included, because that is what the
     * compositor pays for — a minimized window whose bar still declares a blur
     * spends budget nobody can see.
     */
    const countSurfaces = (): Promise<number> =>
      page.evaluate(
        () =>
          [...document.querySelectorAll("*")].filter((el) => {
            const value = getComputedStyle(el).backdropFilter;
            return value !== "" && value !== "none";
          }).length,
      );

    note("backdrop surfaces on /projects", `${await countSurfaces()} (one window)`);

    await page.goto("/");
    await page.waitForSelector("html[data-desktop-ready]", { state: "attached" });
    const windows = await page.locator(".window").count();
    check("BACKDROP-FILTER-SURFACES", await countSurfaces(), `home desktop, ${windows} windows`);

    /**
     * MEM-DECODED-IMAGES is NOT measured, and not because of tooling.
     *
     * The real catalog has one card image; the 1,300 fixture corpus references
     * 1,194 files that do not exist, so nothing decodes at scale. Any number
     * read here would be near zero and would pass the 64 MB budget while
     * proving nothing. What DOES protect it is asserted in grid.spec.ts:
     * `currentSrc` resolves to the 400 px derivative at a narrow viewport, so
     * the browser is being offered card-sized images rather than full-width
     * ones.
     */
    note("MEM-DECODED-IMAGES", "NOT MEASURED — no real images at scale; see grid.spec.ts");
  });

  test("filtering stays inside its timing budget", async ({ page }) => {
    await ready(page);

    // Facet values mount only while their group is open, so open a couple of
    // groups first. Real toggles, not direct engine calls: the budget is on
    // what a visitor experiences, which includes React's re-render.
    await openFacetGroups(page, 2);

    const boxes = page.locator(".facet input[type='checkbox']");
    const available = Math.min(await boxes.count(), 20);
    expect(available, "no facet checkboxes to exercise").toBeGreaterThan(0);

    for (let i = 0; i < available; i += 1) {
      await boxes.nth(i).check();
      await boxes.nth(i).uncheck();
    }

    const samples = await measures(page, "atlas:filter");
    expect(samples.length, "no atlas:filter User Timing entries were recorded").toBeGreaterThan(4);

    check(`FILTER-P95-${AT}`, percentile(samples, 95), `${samples.length} samples`);
    if (AT === "1300") {
      check("FILTER-MEDIAN-1300", percentile(samples, 50), `${samples.length} samples`);
    }
  });

  test("search queries stay inside their timing budget", async ({ page }) => {
    await ready(page);

    /**
     * Enough queries for p95 to be a percentile rather than the maximum.
     *
     * Nearest-rank over 8 samples puts p95 at rank ceil(0.95*8)=8 — the single
     * slowest query, which is always the first one, paying for Fuse's cold
     * caches. That reported 49.7 ms against a 30 ms budget and said nothing
     * about the 30 ms budget.
     *
     * The cold query is NOT discarded: a visitor really does pay it. It is
     * simply weighted as one sample in forty rather than as the whole tail.
     */
    const terms = SEARCH_TERMS;
    let n = 0;
    for (let round = 0; round < 2; round += 1) {
      for (const term of terms) await query(page, `${term}${round === 1 ? " " : ""}`, ++n);
    }

    const samples = await measures(page, "atlas:search");
    expect(samples.length, "no atlas:search User Timing entries were recorded").toBeGreaterThan(30);

    /**
     * How much of that was the ranking engine.
     *
     * Recorded BEFORE the budget assertion, deliberately. `check()` throws when
     * a budget fails, so computing this afterwards made the one diagnostic that
     * explains the failure unreachable in exactly the case it is needed.
     *
     * The split matters because the budget alone cannot distinguish "ranking
     * costs more than budgeted" from "the worker was descheduled while the main
     * thread re-rendered a 1,300-row archive". Those have different fixes, and
     * only one of them is allowed near relevance (PRD 5.2.2).
     */
    const engine = await measures(page, "atlas:search:engine");
    expect(engine.length, "the worker reported no searchMs").toBeGreaterThan(30);

    const total = percentile(samples, 95);
    const enginep95 = percentile(engine, 95);
    note("busy-page engine", `${enginep95.toFixed(1)} ms of ${total.toFixed(1)} ms p95`);
    note("busy-page overhead", `${(total - enginep95).toFixed(1)} ms not spent ranking`);

    check(`SEARCH-QUERY-${AT}`, total, `${samples.length} queries`);
  });

  test("the same queries on an idle page, for comparison", async ({ page }) => {
    /**
     * The archive test above types into a page that re-renders 1,300 rows on
     * every keystroke. This runs identical queries through the palette on the
     * home route, where the main thread has nothing else to do.
     *
     * If this is materially faster, the budget is missed because the worker is
     * starved rather than because ranking is slow — and the fix is main-thread
     * work, which touches relevance not at all.
     */
    await queryViaPalette(page, [...SEARCH_TERMS, ...SEARCH_TERMS.map((t) => `${t} `)]);

    const samples = await measures(page, "atlas:search");
    expect(samples.length, "the palette recorded too few searches to compare").toBeGreaterThan(30);
    const engine = await measures(page, "atlas:search:engine");

    const total = percentile(samples, 95);
    note("idle-page query", `${total.toFixed(1)} ms p95 (${samples.length} queries)`);
    if (engine.length > 0) {
      const enginep95 = percentile(engine, 95);
      note("idle-page engine", `${enginep95.toFixed(1)} ms of ${total.toFixed(1)} ms p95`);
      note("idle-page overhead", `${(total - enginep95).toFixed(1)} ms not spent ranking`);
    }

    // The palette run is also where the remaining search-side budgets live:
    // the same session opened the dialog and hydrated the worker.
    const init = await measures(page, "atlas:worker:init");
    expect(init.length, "the worker reported no initMs").toBeGreaterThan(0);
    check("SEARCH-WORKER-INIT", percentile(init, 95), `${init.length} worker start(s)`);

    const paint = await measures(page, "atlas:paint");
    expect(paint.length, "no query-to-paint was recorded").toBeGreaterThan(3);
    const paintp95 = percentile(paint, 95);

    /**
     * SEARCH-PAINT is measured as main-thread time, not wall clock. ADR 0035.
     *
     * PRD 5.2.3 budgets "main-thread work from a completed query through
     * painted results" at 16 ms — one frame. Wall clock cannot be compared
     * against that: it also contains the wait for the next frame boundary, so a
     * handler doing no work at all still measures a frame and still fails. CI
     * measured 17.6 ms end to end of which 0.3 ms was this application.
     *
     * `atlas:paint:main` is work + style/layout/paint, and excludes only the
     * interval the browser owns. Both halves of what it includes are ours: a
     * careless DOM change shows up in `:render` even when the handler is
     * instant, so this is a real gate rather than a softer one.
     *
     * The wall-clock number is still reported on every run. It is what a person
     * waits, and it must stay visible even though it is not what is gated.
     *
     * Notes come before the `check`, deliberately: `check` throws on a breach,
     * so a diagnostic placed after it is missing from precisely the run that
     * needs explaining.
     */
    const main = await measures(page, "atlas:paint:main");
    const work = await measures(page, "atlas:paint:work");
    const render = await measures(page, "atlas:paint:render");
    expect(main.length, "no main-thread paint cost was recorded").toBeGreaterThan(3);

    note("paint wall clock", `${paintp95.toFixed(1)} ms p95 query to pixels`);
    note("paint work", `${percentile(work, 95).toFixed(1)} ms p95 building the DOM`);
    note("paint render", `${percentile(render, 95).toFixed(1)} ms p95 style, layout and paint`);
    note(
      "paint frame wait",
      `${(paintp95 - percentile(main, 95)).toFixed(1)} ms waiting for the browser`,
    );

    check("SEARCH-PAINT", percentile(main, 95), `${main.length} paints, main-thread time`);
  });

  test("the palette opens inside its budget", async ({ page }) => {
    /**
     * Measured on a PRELOADED palette, which is the path PRD 5.2.1 designs for:
     * it requires preloading on "search-button hover, search-button focus, a
     * 2-second idle callback, or explicit shortcut" precisely so the dialog is
     * already in memory when the command arrives.
     *
     * The un-preloaded open is reported separately rather than dropped. It is a
     * real experience — someone can hit the chord a moment after load — but
     * folding a one-off chunk fetch into a 50 ms interaction budget measures
     * the network rather than the palette, and a single cold sample was all the
     * first version of this test had.
     */
    await page.goto("/");
    await page.waitForSelector("html[data-palette-ready]", { state: "attached" });

    // Hover the search form: one of the preload triggers the PRD names.
    await page.locator("form[role='search']").hover();
    await page.waitForTimeout(1500);

    /**
     * Twenty-four opens, not six.
     *
     * Nearest-rank p95 over five warm samples IS the maximum, so this budget was
     * reporting the worst of five opens and calling it a p95 — one scheduling
     * hiccup and it read 96 ms against a 50 ms budget while the median sat near
     * 22. ADR 0033 records the identical correction for `SEARCH-QUERY`, which
     * measured eight samples and moved to forty for exactly this reason.
     *
     * This does make the budget easier to satisfy, and that is the point rather
     * than a side effect: a number that swings between 18 and 96 on an unchanged
     * build is not measuring the palette, and enforcing it enforces nothing.
     */
    const OPENS = 24;
    for (let i = 0; i < OPENS; i += 1) {
      await page.keyboard.press("ControlOrMeta+k");
      await expect(page.locator("[role='dialog']")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator("[role='dialog']")).toBeHidden();
    }

    /**
     * Wait for the instrumentation, not just for the dialog.
     *
     * `measureAfterPaint` closes a measure on the frame AFTER the dialog paints,
     * so the last presses are still in flight when the loop ends. Counting
     * immediately gave 4 or 5 of 6 depending on the machine — reported as "no
     * palette open was recorded" on CI, which read like the palette was broken
     * when the real fault was reading too early. Instrumented directly, the
     * counts after each press were 1, 1, 3, 3, 5, 5, and 6 once settled.
     *
     * Waiting for all of them makes the assertion stronger rather than looser:
     * the p95 below is now over a known sample count instead of over however
     * many happened to have landed.
     */
    await expect
      .poll(async () => (await measures(page, "atlas:palette:open")).length, { timeout: 10_000 })
      .toBe(OPENS);

    const opens = await measures(page, "atlas:palette:open");

    // The first open still builds the dialog's DOM, even preloaded.
    const [cold, ...warm] = opens;
    note("palette open, first", `${(cold ?? Number.NaN).toFixed(1)} ms (builds the DOM once)`);
    check("PALETTE-OPEN", percentile(warm, 95), `${warm.length} preloaded opens`);
  });

  test("filter-to-paint stays inside its budget", async ({ page }) => {
    await ready(page);
    await openFacetGroups(page, 2);

    const boxes = page.locator(".facet input[type='checkbox']");
    const available = Math.min(await boxes.count(), 12);
    expect(available, "no facet checkboxes to exercise").toBeGreaterThan(0);
    for (let i = 0; i < available; i += 1) {
      await boxes.nth(i).check();
      await boxes.nth(i).uncheck();
    }

    const samples = await measures(page, "atlas:filter-paint");
    expect(samples.length, "no atlas:filter-paint entries were recorded").toBeGreaterThan(3);
    check("FILTER-TO-PAINT", percentile(samples, 95), `${samples.length} interactions`);
  });

  test("the heap does not grow across repeated search, filter and view cycles", async ({
    page,
    context,
  }) => {
    /**
     * MEM-HEAP-GROWTH: <=10% after twenty search/filter/view cycles, "after GC
     * opportunity" (PRD 9.5).
     *
     * This budget names a VIEW cycle, so it could not be measured before Phase
     * 4 — there was only one view. It is the leak detector for everything this
     * archive builds and tears down repeatedly: the grid's ResizeObserver, the
     * capture-phase error listener, the virtualizer's row cache, the search
     * client and its worker. A leak here is invisible in every other budget
     * until a long session degrades.
     *
     * Growth rather than an absolute: heap size depends on the engine's whims,
     * but a heap that keeps climbing across identical cycles is a leak whatever
     * the starting number.
     */
    await gridReady(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send("HeapProfiler.enable");

    const settledHeap = async (): Promise<number> => {
      // Collect more than once: the first pass frees objects that only become
      // unreachable when the first pass drops their last reference.
      for (let i = 0; i < 3; i += 1) {
        await cdp.send("HeapProfiler.collectGarbage");
        await page.waitForTimeout(120);
      }
      const usage = (await cdp.send("Runtime.getHeapUsage")) as { usedSize: number };
      return usage.usedSize;
    };

    /**
     * Warm with COMPLETE cycles before taking the baseline.
     *
     * The budget asks what twenty cycles retain, so the baseline has to come
     * from a warmed heap. An earlier version toggled a facet and stopped, which
     * left the rows view, the worker's result structures and the engine's label
     * cache to be allocated inside the measured window — one-time costs
     * reported as growth. Growth then read 9.09% against a 10% budget and was
     * mostly warmup.
     *
     * Three full cycles: search, filter, and a view switch in both directions.
     */
    await openFacetGroups(page, 1);
    for (let warm = 0; warm < 3; warm += 1) {
      await page.locator("#catalog-q").fill(SEARCH_TERMS[warm] ?? "agent");
      const box = page.locator(".facet input[type='checkbox']").first();
      await box.check();
      await box.uncheck();
      await page.getByRole("radio", { name: "rows" }).check();
      await page.getByRole("radio", { name: "grid" }).check();
    }
    await page.locator("#catalog-q").fill("");

    const before = await settledHeap();

    for (let cycle = 0; cycle < 20; cycle += 1) {
      await page.locator("#catalog-q").fill(SEARCH_TERMS[cycle % SEARCH_TERMS.length] ?? "agent");
      const box = page.locator(".facet input[type='checkbox']").first();
      await box.check();
      await box.uncheck();
      // The view half of the cycle: mount and unmount an entire virtualized
      // view each time round.
      await page.getByRole("radio", { name: "rows" }).check();
      await page.getByRole("radio", { name: "grid" }).check();
    }
    await page.locator("#catalog-q").fill("");

    const after = await settledHeap();
    const growth = ((after - before) / before) * 100;

    note(
      "heap",
      `${(before / 1024 / 1024).toFixed(1)} MB -> ${(after / 1024 / 1024).toFixed(1)} MB across 20 cycles`,
    );
    check("MEM-HEAP-GROWTH", growth, "20 search/filter/view cycles, after GC");

    /**
     * MEM-JS-HEAP is 75 MB "after 10 minutes". The absolute heap after these
     * cycles is reported for reference, but it is NOT checked against that
     * budget: a two-minute test does not measure a ten-minute one, and calling
     * it a pass would be answering a question nobody asked.
     */
    note(
      "MEM-JS-HEAP",
      `${(after / 1024 / 1024).toFixed(1)} MB after cycles, not after 10 minutes`,
    );
  });

  test("worker memory and scroll layout", async ({ page, context }) => {
    await ready(page);
    // Warm the worker: it only holds the index after a query.
    await query(page, "agent", 1);

    const cdp = await context.newCDPSession(page);

    /**
     * SEARCH-WORKER-MEMORY (PRD 5.2.3, <=12 MB retained at 1,300).
     *
     * `Runtime.getHeapUsage` on the page target reports the page's isolate, not
     * the worker's. Measuring that and calling it worker memory would be
     * reporting the wrong number under the right name, so the worker target is
     * attached explicitly and skipped — loudly — if it cannot be found.
     */
    const targets = await cdp.send("Target.getTargets");
    const workerTarget = targets.targetInfos.find(
      (t) => t.type === "worker" || t.type === "dedicated_worker",
    );

    if (workerTarget === undefined) {
      note("SEARCH-WORKER-MEMORY", "NOT MEASURED — no worker target was attachable");
    } else {
      const session = await cdp.send("Target.attachToTarget", {
        targetId: workerTarget.targetId,
        flatten: true,
      });
      void session;
      const workerCdp = await context.newCDPSession(page);
      await workerCdp.send("Runtime.enable");
      const usage = (await workerCdp.send("Runtime.getHeapUsage")) as { usedSize: number };
      check(
        "SEARCH-WORKER-MEMORY",
        usage.usedSize / (1024 * 1024),
        "worker isolate, after a query",
      );
    }

    /**
     * FORCED-LAYOUTS-SCROLL (PRD 9.3, 0 during scroll).
     *
     * CDP exposes `LayoutCount`, which counts ALL layout, not specifically
     * forced synchronous layout — and a virtualizer legitimately lays out as
     * rows mount. A zero here would therefore be unachievable and a pass would
     * be meaningless, so the count is reported rather than asserted.
     */
    await cdp.send("Performance.enable");
    const before = await cdp.send("Performance.getMetrics");
    for (let i = 0; i < 8; i += 1) {
      await page.mouse.wheel(0, 4000);
      await page.waitForTimeout(80);
    }
    const after = await cdp.send("Performance.getMetrics");
    const layoutOf = (m: { metrics: { name: string; value: number }[] }): number =>
      m.metrics.find((x) => x.name === "LayoutCount")?.value ?? 0;
    note(
      "FORCED-LAYOUTS-SCROLL",
      `NOT MEASURED — CDP counts all layout, not forced layout. ` +
        `${layoutOf(after) - layoutOf(before)} layouts across 8 scroll steps, for reference.`,
    );
  });

  test("no task exceeds the long-task ceiling during search and filter", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __longTasks: number[] };
      w.__longTasks = [];
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) w.__longTasks.push(entry.duration);
        }).observe({ entryTypes: ["longtask"] });
      } catch {
        // Unsupported. Reported as zero SAMPLES below, never as zero long
        // tasks — that would be a false pass.
      }
    });

    await ready(page);

    /**
     * The budget's scope is `task:any-during-search-or-filter`, so the window
     * starts here — after load.
     *
     * Loading is genuinely expensive at 1,300 records: parsing catalog-core,
     * building the term maps and the island's first render produced a single
     * ~99 ms task. That is real and worth knowing, but it is a load cost, and
     * measuring it against an interaction budget would be reporting the wrong
     * number. It is recorded below as an observation rather than silently
     * dropped, and belongs to INP work in Phase 5.
     */
    const loadTasks = await page.evaluate(
      () => (window as unknown as { __longTasks: number[] }).__longTasks,
    );
    await page.evaluate(() => {
      (window as unknown as { __longTasks: number[] }).__longTasks.length = 0;
    });

    await query(page, "agent", 1);
    await openFacetGroups(page, 2);
    const boxes = page.locator(".facet input[type='checkbox']");
    for (let i = 0; i < Math.min(await boxes.count(), 8); i += 1) {
      await boxes.nth(i).check();
    }
    await page.waitForTimeout(300);

    const tasks = await page.evaluate(
      () => (window as unknown as { __longTasks: number[] }).__longTasks,
    );
    const worst = tasks.length === 0 ? 0 : Math.max(...tasks);
    const worstLoad = loadTasks.length === 0 ? 0 : Math.max(...loadTasks);
    check(
      "LONG-TASK-CEILING",
      worst,
      `${tasks.length} during interaction; ${loadTasks.length} at load, worst ${Math.round(worstLoad)} ms (not this budget)`,
    );
  });
});
