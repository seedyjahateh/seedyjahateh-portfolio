/**
 * Deterministic screenshots.
 *
 * Authority: PRD 11.2 — "Visual tests: deterministic screenshots for themes,
 * view modes, breakpoints, long text, missing media, and filtered empty
 * states." Those six axes are the structure of this file.
 *
 * CI ONLY, LINUX BASELINES. Playwright renders differently on Windows and
 * Linux — font rasterisation alone guarantees it — so one authoritative set of
 * images is kept, generated on the runner that enforces the gate. Two sets
 * would mean every card change regenerates both, or one silently goes stale and
 * starts lying.
 *
 * DETERMINISM IS THE WHOLE DIFFICULTY. These run against the real 240-record
 * build rather than a fixture corpus: it is committed, stable, and it is what
 * ships. Animations are disabled, motion is reduced, and every capture waits
 * for fonts and for the catalog island, because a screenshot taken mid-hydration
 * is a different picture every run.
 */

import { expect, test, type Page } from "@playwright/test";

/** Breakpoints that straddle the packer's column counts (GRID_BREAKPOINTS). */
const BREAKPOINTS = [
  { name: "mobile", width: 390, height: 900 },
  { name: "tablet", width: 820, height: 900 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

/**
 * Everything that makes a repeat run differ from the last.
 *
 * Without this the caret blinks, transitions land mid-flight and the search
 * field's placeholder animates — none of which is a regression, all of which
 * changes pixels.
 */
async function settle(page: Page, colorScheme: "light" | "dark" = "light"): Promise<void> {
  // Both in ONE call. PRD 9.7 and 10.1 want reduced motion on every capture,
  // and a second emulateMedia is not obviously additive — setting the scheme
  // and the motion preference together removes the question.
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme });
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation: none !important;
      transition: none !important;
      caret-color: transparent !important;
    }`,
  });
  await page.evaluate(() => document.fonts.ready);
  // One frame, so the style tag above is in effect before the capture.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function archive(
  page: Page,
  url = "/projects",
  colorScheme: "light" | "dark" = "light",
): Promise<void> {
  await page.goto(url);
  await page.waitForSelector("html[data-catalog-active]", { state: "attached" });
  await settle(page, colorScheme);
}

test.describe("archive", () => {
  for (const breakpoint of BREAKPOINTS) {
    test(`grid at ${breakpoint.name}`, async ({ page }) => {
      await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });
      await archive(page);
      await expect(page.locator(".card").first()).toBeVisible();
      await expect(page).toHaveScreenshot(`grid-${breakpoint.name}.png`, { fullPage: false });
    });
  }

  for (const scheme of ["light", "dark"] as const) {
    test(`grid in the ${scheme} theme`, async ({ page }) => {
      // PRD 10.1 requires tokens to be tested in every theme; a contrast
      // regression in one theme is invisible from the other.
      await page.setViewportSize({ width: 1440, height: 900 });
      await archive(page, "/projects", scheme);
      await expect(page).toHaveScreenshot(`grid-${scheme}.png`);
    });
  }

  test("rows view", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await archive(page, "/projects?view=rows");
    await expect(page.locator(".row:not(.row--head)").first()).toBeVisible();
    await expect(page).toHaveScreenshot("rows-desktop.png");
  });

  test("missing media", async ({ page }) => {
    /**
     * 239 of 240 records have no card image, so the placeholder is the ordinary
     * case rather than an edge one. This is the picture that catches a
     * placeholder regressing into a blank or broken-image frame.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    await archive(page);
    await expect(page.locator(".card__placeholder").first()).toBeAttached();
    await expect(page.locator(".grid").first()).toHaveScreenshot("missing-media.png");
  });

  test("long text is clamped, not overflowing", async ({ page }) => {
    // PRD 5.4.1 bounds card text with line clamps; expanded content belongs on
    // the detail route. Injected rather than waiting for a record with a long
    // title, so the case is covered whatever the catalog currently holds.
    await page.setViewportSize({ width: 1440, height: 900 });
    await archive(page);
    await page.evaluate(() => {
      const card = document.querySelector(".card");
      const title = card?.querySelector(".card__title a");
      const claim = card?.querySelector(".card__claim");
      if (title !== null && title !== undefined) {
        title.textContent = "A deliberately overlong project title ".repeat(6);
      }
      if (claim !== null && claim !== undefined) {
        claim.textContent = "A deliberately overlong claim sentence ".repeat(10);
      }
    });
    await expect(page.locator(".card").first()).toHaveScreenshot("long-text.png");
  });

  test("filtered empty state", async ({ page }) => {
    /**
     * Two facet values that both EXIST in the dictionaries but never co-occur:
     * the only `live` record is in progress, so intersecting it with `planned`
     * is empty.
     *
     * The values have to exist. A first attempt used `archived` and
     * `externally-validated`, which no record has — so the vocabulary gate
     * dropped them both (PRD 5.3.3 discards unknown values rather than
     * returning nothing), the filter quietly became `status=planned`, and the
     * test screenshotted 238 results while claiming to show an empty state.
     *
     * Corpus-dependent by nature. The assertion below is what makes that safe:
     * if authoring ever makes this combination non-empty, it fails loudly
     * instead of baselining the wrong screen.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    await archive(page, "/projects?proof=live&status=planned");
    await expect(page.locator(".tokens li")).toHaveCount(2);
    await expect(page.locator(".empty-state")).toBeVisible();
    await expect(page).toHaveScreenshot("empty-state.png");
  });
});
