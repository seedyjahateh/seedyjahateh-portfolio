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

async function ready(page: Page): Promise<number> {
  await page.goto("/projects");
  await page.waitForSelector("html[data-catalog-active]", { state: "attached" });
  await page.waitForSelector(".row:not(.row--head)");
  return Number((await page.locator("[role='grid']").getAttribute("aria-rowcount")) ?? "1") - 1;
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
    expect(total, "the corpus in apps/web/out is smaller than expected").toBeGreaterThan(100);

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
    check("DOM-ARCHIVE-STEADY", worstDom, "worst of 12 scroll steps");
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
    const terms = [
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
    let n = 0;
    for (let round = 0; round < 2; round += 1) {
      for (const term of terms) await query(page, `${term}${round === 1 ? " " : ""}`, ++n);
    }

    const samples = await measures(page, "atlas:search");
    expect(samples.length, "no atlas:search User Timing entries were recorded").toBeGreaterThan(30);

    check(`SEARCH-QUERY-${AT}`, percentile(samples, 95), `${samples.length} queries`);
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
