/**
 * Client catalog engine on /projects.
 *
 * Authority: PRD 5.3.3 (canonical URL state, back/forward restores exactly,
 * removable tokens, clear-all, total result count), 5.4 (all views consume
 * VisibleProjectIds), 5.4.2 (virtualized rows, aria-rowcount / aria-rowindex),
 * 9.3 (`MOUNTED-ROWS-MAX` 72, `DOM-ARCHIVE-STEADY` 1000), 9.7 (usable without
 * JavaScript), 10.1 / A11Y-AXE-SERIOUS.
 *
 * The runtime DOM counts here are the ones `measure-routes.ts` structurally
 * cannot see: it reads exported HTML, and virtualization only exists after
 * hydration.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const ROW = ".row:not(.row--head)";

/**
 * These tests exercise the dense row view, so they ask for it explicitly.
 *
 * Phase 4 made the grid the default archive view (PRD 5.4.1), which is what a
 * bare `/projects` now renders. Rows remain a supported view and its
 * virtualization budgets still need covering, so the view is named in the URL
 * rather than assumed — which is also a better test, since it proves a
 * deep-linked `?view=` is honoured on load.
 */
const ROWS_URL = "/projects?view=rows";

/** The island sets this once the catalog has actually loaded. */
async function catalogReady(page: Page): Promise<void> {
  await page.waitForSelector("html[data-catalog-active]", { state: "attached" });
  await expect(page.locator(ROW).first()).toBeVisible();
}

test.describe("archive catalog engine", () => {
  test("takes over from the static index once loaded", async ({ page }) => {
    await page.goto(ROWS_URL);
    // The static list is still in the DOM — it is the crawler and no-JS path —
    // but hidden once the client engine is live.
    await catalogReady(page);
    await expect(page.locator("#static-index")).toBeHidden();
    await expect(page.locator("[role='grid']")).toBeVisible();
  });

  test("keeps a visible h1 after the island takes over", async ({ page }) => {
    /**
     * Regression. The h1 originally lived inside ProjectsIndex, which the
     * island hides once it loads — so the archive ended up with exactly one h1
     * in the markup and none a visitor could see. PRD 10.1 requires one visible
     * h1 per page.
     *
     * No static check catches this: the exported HTML has the heading, and it
     * only disappears after hydration.
     */
    await page.goto(ROWS_URL);
    await catalogReady(page);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("announces a total and exposes row semantics", async ({ page }) => {
    await page.goto(ROWS_URL);
    await catalogReady(page);

    await expect(page.locator(".catalog__status")).toContainText(/\d+ projects/);
    // PRD 5.4.2: aria-rowcount includes the header row.
    const grid = page.locator("[role='grid']");
    const rowcount = Number(await grid.getAttribute("aria-rowcount"));
    expect(rowcount).toBeGreaterThan(1);
    await expect(page.locator(ROW).first()).toHaveAttribute("aria-rowindex", "2");
  });

  test("mounts far fewer rows than the catalog holds", async ({ page }) => {
    // MOUNTED-ROWS-MAX is 72. This is the budget virtualization exists to meet,
    // and it is invisible to any check that only reads exported HTML.
    await page.goto(ROWS_URL);
    await catalogReady(page);

    const mounted = await page.locator(ROW).count();
    const total = Number(await page.locator("[role='grid']").getAttribute("aria-rowcount")) - 1;

    expect(total).toBeGreaterThan(100);
    expect(mounted).toBeLessThanOrEqual(72);
  });

  test("keeps the archive DOM under its steady budget", async ({ page }) => {
    // DOM-ARCHIVE-STEADY is 1000 elements.
    await page.goto(ROWS_URL);
    await catalogReady(page);
    const elements = await page.evaluate(() => document.querySelectorAll("*").length);
    expect(elements).toBeLessThanOrEqual(1000);
  });

  test("stays bounded after scrolling", async ({ page }) => {
    await page.goto(ROWS_URL);
    await catalogReady(page);

    /**
     * The list scrolls, not the page, so the wheel has to be over it — and the
     * window has to be shown to have moved.
     *
     * Both assertions below are upper bounds, which is exactly the shape that
     * passes when nothing happens: a virtualizer that never recycled reports
     * the initial mount, which is comfortably under 72. Without the hover the
     * pointer sits at 0,0 and every wheel event goes to the document.
     */
    await page.locator(".rows").hover();
    const firstBefore = await page.locator(ROW).first().getAttribute("aria-rowindex");

    for (let i = 0; i < 5; i += 1) {
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(120);
    }

    const firstAfter = await page.locator(ROW).first().getAttribute("aria-rowindex");
    expect(firstBefore, "no aria-rowindex on the first row").not.toBeNull();
    expect(firstAfter, "scrolling never moved the virtualized window").not.toBe(firstBefore);

    expect(await page.locator(ROW).count()).toBeLessThanOrEqual(72);
    expect(await page.evaluate(() => document.querySelectorAll("*").length)).toBeLessThanOrEqual(
      1000,
    );
  });

  test("a facet narrows the set and lands in the URL", async ({ page }) => {
    await page.goto(ROWS_URL);
    await catalogReady(page);
    const before = Number(await page.locator("[role='grid']").getAttribute("aria-rowcount"));

    await page.locator(".facet").first().locator("summary").click();
    await page.locator(".facet").first().locator("input[type='checkbox']").first().check();

    // PRD 5.3.3: canonical state lives in the URL.
    await expect(page).toHaveURL(/\?/);
    const after = Number(await page.locator("[role='grid']").getAttribute("aria-rowcount"));
    expect(after).toBeLessThan(before);
    await expect(page.locator(".tokens li")).toHaveCount(1);
  });

  test("clear-all removes every token", async ({ page }) => {
    await page.goto(ROWS_URL);
    await catalogReady(page);

    await page.locator(".facet").first().locator("summary").click();
    await page.locator(".facet").first().locator("input[type='checkbox']").first().check();
    await expect(page.locator(".tokens li")).toHaveCount(1);

    await page.getByRole("button", { name: /clear 1 filter/i }).click();
    await expect(page.locator(".tokens")).toHaveCount(0);
    // The filter is gone from the URL; `view=rows` stays, because it is not the
    // default and canonical state only omits defaults.
    await expect(page).toHaveURL(/\/projects\?view=rows$/);
  });

  test("a deep-linked filter URL is honoured on load", async ({ page }) => {
    await page.goto(ROWS_URL);
    await catalogReady(page);
    const unfiltered = Number(await page.locator("[role='grid']").getAttribute("aria-rowcount"));

    // Read a real facet value out of the compiled dictionaries rather than
    // hard-coding one that could disappear from the corpus.
    const value = await page.evaluate(async () => {
      const manifest = (await (await fetch("/catalog/manifest.json")).json()) as {
        artifacts: Record<string, { url: string }>;
      };
      const url = manifest.artifacts["facets"]?.url ?? "";
      const facets = (await (await fetch(url)).json()) as {
        groups: { group: string; values: { value: string }[] }[];
      };
      return facets.groups.find((g) => g.group === "status")?.values[0]?.value ?? "";
    });
    expect(value).not.toBe("");

    await page.goto(`/projects?view=rows&status=${value}`);
    await catalogReady(page);
    await expect(page.locator(".tokens li")).toHaveCount(1);
    const filtered = Number(await page.locator("[role='grid']").getAttribute("aria-rowcount"));
    expect(filtered).toBeLessThanOrEqual(unfiltered);
  });

  test("back restores the previous filter state", async ({ page }) => {
    // PRD 5.3.3: back/forward restores the exact query, filters, sort and view.
    await page.goto(ROWS_URL);
    await catalogReady(page);

    const value = await page.evaluate(async () => {
      const manifest = (await (await fetch("/catalog/manifest.json")).json()) as {
        artifacts: Record<string, { url: string }>;
      };
      const url = manifest.artifacts["facets"]?.url ?? "";
      const facets = (await (await fetch(url)).json()) as {
        groups: { group: string; values: { value: string }[] }[];
      };
      return facets.groups.find((g) => g.group === "status")?.values[0]?.value ?? "";
    });

    await page.goto(`/projects?view=rows&status=${value}`);
    await catalogReady(page);
    await expect(page.locator(".tokens li")).toHaveCount(1);

    await page.goBack();
    await catalogReady(page);
    await expect(page.locator(".tokens")).toHaveCount(0);
  });

  test("sorting by title reorders the rows", async ({ page }) => {
    await page.goto(ROWS_URL);
    await catalogReady(page);
    const firstBefore = await page.locator(`${ROW} .row__id`).first().textContent();

    await page.locator("#catalog-sort").selectOption("title");
    await expect(page).toHaveURL(/sort=title/);

    const firstAfter = await page.locator(`${ROW} .row__id`).first().textContent();
    expect(firstAfter).not.toBe(firstBefore);
  });

  test("has no serious or critical axe violations", async ({ page }) => {
    await page.goto(ROWS_URL);
    await catalogReady(page);

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
