/**
 * Evidence grid.
 *
 * Authority: PRD 5.4.1 (default archive view, deterministic spans, packed rows,
 * bounded text), 9.3 (no per-card listeners or observers, zero media layout
 * shift, `MOUNTED-CARDS-MAX`), 9.5 (`MEM-DECODED-IMAGES`, which is why cards
 * must serve a card-sized derivative), 9.7 (image failure preserves geometry
 * and shows a placeholder), 5.3.3 (back/forward restores the focused project),
 * 10.1 / `A11Y-AXE-SERIOUS`.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The breakpoint rule itself, not a copy of it: a test that retypes the numbers
// agrees with a regression that changes them.
import { columnsForWidth } from "@atlas/engine/pack";

const CARD = ".card";

async function gridReady(page: Page): Promise<void> {
  await page.waitForSelector("html[data-catalog-active]", { state: "attached" });
  await expect(page.locator(CARD).first()).toBeVisible();
}

test.describe("evidence grid", () => {
  test("is the default archive view", async ({ page }) => {
    // PRD 5.4.1: "Default archive view on desktop and tablet." DEFAULT_VIEW is
    // already `grid`, and serializeUrlState omits defaults — so a bare
    // /projects URL must land on the grid without saying so.
    await page.goto("/projects");
    await gridReady(page);
    await expect(page.locator("[role='list'][aria-label='Projects']")).toBeVisible();
    await expect(page.locator("[role='grid']")).toHaveCount(0);
  });

  test("switches to rows and back, through the URL", async ({ page }) => {
    await page.goto("/projects");
    await gridReady(page);

    await page.getByRole("radio", { name: "rows" }).check();
    await expect(page).toHaveURL(/view=rows/);
    await expect(page.locator("[role='grid']")).toBeVisible();

    await page.getByRole("radio", { name: "grid" }).check();
    // grid is the default, so canonical state drops the parameter entirely.
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.locator(CARD).first()).toBeVisible();
  });

  test("honours a deep-linked view", async ({ page }) => {
    await page.goto("/projects?view=rows");
    await page.waitForSelector("html[data-catalog-active]", { state: "attached" });
    await expect(page.locator("[role='grid']")).toBeVisible();
    await expect(page.locator(CARD)).toHaveCount(0);
  });

  /**
   * The grid is actually a grid.
   *
   * The overfull check below cannot catch this: with one column every card
   * spans one, `used > columns` is never true, and a grid collapsed to a single
   * column passes it perfectly. The first Linux baselines were screenshots of
   * exactly that — one full-width card per row at 1440 px, where the breakpoint
   * table specifies four — and every grid budget was green underneath it,
   * because a one-column grid mounts few cards and shifts nothing.
   *
   * So this asserts the column count the tokens require, against
   * `GRID_BREAKPOINTS` rather than a number retyped here. Widths are content-box
   * widths of `.grid`, which is what the ResizeObserver reports.
   */
  test("renders the column count its breakpoints specify", async ({ page }) => {
    for (const viewport of [400, 700, 1000, 1400]) {
      await page.setViewportSize({ width: viewport, height: 900 });
      await page.goto("/projects");
      await gridReady(page);

      const seen = await page.evaluate(() => {
        const grid = document.querySelector(".grid");
        if (grid === null) return null;
        const span = /span (\d+)/;
        const rows = [...document.querySelectorAll(".grid__row")];
        return {
          width: grid.getBoundingClientRect().width,
          columns: Number(getComputedStyle(grid).getPropertyValue("--grid-columns")),
          // Columns occupied, not cards placed: one `feature` spanning two is
          // just as much proof of a two-column layout as two standard cards.
          widestRow: Math.max(
            0,
            ...rows.map((r) =>
              [...r.querySelectorAll<HTMLElement>(".card")].reduce((sum, c) => {
                const m = span.exec(c.style.gridColumn);
                return sum + (m === null ? 1 : Number(m[1]));
              }, 0),
            ),
          ),
        };
      });

      expect(seen, "the grid container is missing").not.toBeNull();
      const expected = columnsForWidth(seen?.width ?? 0);

      expect(
        seen?.columns,
        `at a ${viewport}px viewport the grid is ${seen?.width}px wide, which the breakpoint table gives ${expected} columns`,
      ).toBe(expected);

      // A column count nothing lays out against would be a passing number over
      // a single-file list. Checked across all mounted rows, not the first:
      // `feature` and `wide` cards span two, so leading rows legitimately hold
      // one card each and prove nothing either way.
      if (expected > 1) {
        expect(
          seen?.widestRow,
          `at a ${viewport}px viewport no row occupied more than one column, so ${expected} columns is a number nothing lays out against`,
        ).toBeGreaterThan(1);
      }
    }
  });

  /**
   * Text clamps by line, never by slicing a line in half.
   *
   * PRD 5.4.1 bounds card text, and `-webkit-line-clamp` is how: a long title
   * ends after two whole lines. What must not happen is a box shorter than one
   * line, which cuts the glyphs through the middle and reads as a rendering
   * fault rather than a limit.
   *
   * This is measured because it is invisible to every other check. A squashed
   * title mounts, occupies its slot and shifts nothing, so the grid budgets and
   * the axe pass were all green while the first Linux baselines showed titles
   * sliced across the middle.
   */
  test("clamps card text by whole lines, never mid-glyph", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/projects");
    await gridReady(page);

    const sliced = await page.evaluate(() => {
      const bad: string[] = [];
      for (const card of document.querySelectorAll<HTMLElement>(".card")) {
        for (const selector of [".card__title", ".card__claim", ".card__meta"]) {
          const el = card.querySelector<HTMLElement>(selector);
          if (el === null || el.textContent?.trim() === "") continue;
          const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight);
          if (Number.isNaN(lineHeight)) continue;
          // One whole line, less a pixel for sub-pixel rounding.
          if (el.clientHeight < lineHeight - 1) {
            bad.push(`${selector} is ${el.clientHeight}px against a ${lineHeight}px line`);
          }
        }
      }
      return bad.slice(0, 5);
    });

    expect(sliced, "card text is cut through the middle of a line").toEqual([]);
  });

  /**
   * A card says whether the work exists.
   *
   * 238 of 240 records are `planned`. Until this test the grid rendered a proof
   * level and withheld the status, so a card announced "code" for a project
   * with no code, no link and no evidence, and read identically to one that
   * shipped. PRD 0.10 does not permit the catalog to be ambiguous about what is
   * real, and the grid is the default view.
   *
   * The label is asserted, not the colour: colour alone would fail WCAG 1.4.1
   * and is not what a screen reader conveys.
   */
  test("states whether a project is planned or built", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/projects");
    await gridReady(page);

    const cards = page.locator(CARD);
    const mounted = await cards.count();
    expect(mounted, "no cards mounted").toBeGreaterThan(0);

    for (let index = 0; index < mounted; index += 1) {
      const card = cards.nth(index);
      const status = await card.getAttribute("data-status");
      // A card with no status in the catalog carries no attribute and no label,
      // rather than a guess. Anything else must show the word.
      if (status === null) continue;
      // The attribute is the slug, the text is the label it came from.
      await expect(
        card.locator(".card__state"),
        "a card carries a status but never says so",
      ).toHaveText(new RegExp(`^${status.replace(/-/g, "[ -]")}$`, "i"));
    }

    // The catalog is overwhelmingly planned; if nothing says so, the wiring is
    // broken however green the loop above is.
    await expect(page.locator('.card[data-status="planned"] .card__state').first()).toBeVisible();
  });

  test("packs cards into rows without exceeding the column count", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/projects");
    await gridReady(page);

    // Spans come from CARD_VARIANT_SPAN; a row may be short but never overfull.
    const overfull = await page.evaluate(() => {
      const grid = document.querySelector(".grid");
      if (grid === null) return -1;
      const columns = Number(getComputedStyle(grid).getPropertyValue("--grid-columns"));
      const span = /span (\d+)/;
      return [...document.querySelectorAll(".grid__row")].filter((row) => {
        const used = [...row.querySelectorAll<HTMLElement>(".card")].reduce((sum, card) => {
          const match = span.exec(card.style.gridColumn);
          return sum + (match === null ? 1 : Number(match[1]));
        }, 0);
        return used > columns;
      }).length;
    });
    expect(overfull, "a packed row exceeded its column count").toBe(0);
  });

  test("creates one ResizeObserver, not one per card", async ({ page }) => {
    /**
     * PRD 9.3: "Never create a listener, ResizeObserver, IntersectionObserver,
     * or animation controller per card." Counted rather than read from the
     * source, because the source is exactly what a refactor changes.
     */
    await page.addInitScript(() => {
      const Native = window.ResizeObserver;
      const w = window as unknown as { __roCount: number };
      w.__roCount = 0;
      window.ResizeObserver = class extends Native {
        constructor(cb: ResizeObserverCallback) {
          super(cb);
          w.__roCount += 1;
        }
      };
    });

    await page.goto("/projects");
    await gridReady(page);
    const count = await page.evaluate(() => (window as unknown as { __roCount: number }).__roCount);
    // One for the grid. Comfortably below the number of rendered cards either
    // way, which is the property that matters.
    expect(count).toBeLessThanOrEqual(2);
    expect(await page.locator(CARD).count()).toBeGreaterThan(count);
  });

  test("reserves media geometry, so a missing image shifts nothing", async ({ page }) => {
    // 239 of 240 records have no card image at all, so the placeholder is the
    // common case rather than an edge one.
    await page.goto("/projects");
    await gridReady(page);

    const media = page.locator(".card__media").first();
    const box = await media.boundingBox();
    expect(box?.height ?? 0, "the media frame has no reserved height").toBeGreaterThan(0);
    await expect(page.locator(".card__placeholder").first()).toBeAttached();
  });

  test("serves a card-sized derivative, not the full-width original", async ({ page }) => {
    /**
     * The whole `MEM-DECODED-IMAGES` argument rests on this. FS-01's card image
     * is 736 px wide and derivatives exist at 400 and 736; a narrow viewport
     * must resolve to the 400.
     *
     * `currentSrc` is what the browser actually chose, so this cannot pass by
     * the markup merely looking right.
     */
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto("/projects?q=berea");
    await gridReady(page);

    const img = page.locator(".card__media img").first();
    await expect(img).toBeVisible({ timeout: 15_000 });
    await img.evaluate((el: HTMLImageElement) => el.decode().catch(() => undefined));

    const chosen = await img.evaluate((el: HTMLImageElement) => el.currentSrc);
    expect(chosen, "the browser was given no smaller derivative to choose").toMatch(/-400\./);
  });

  test("has no serious or critical axe violations", async ({ page }) => {
    await page.goto("/projects");
    await gridReady(page);

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test("restores the focused project on back", async ({ page }) => {
    // PRD 5.3.3: back/forward restores "the exact query, filters, sort, view,
    // and focused project". With a virtualizer the browser cannot do this
    // itself — the card is not in the DOM when it tries.
    await page.goto("/projects");
    await gridReady(page);

    const link = page.locator(`${CARD} .card__title a`).nth(3);
    const slug = await link.evaluate(
      (el) => el.closest<HTMLElement>("[data-slug]")?.dataset["slug"],
    );
    await link.focus();
    await expect(page).toHaveURL(new RegExp(`focus=${slug}`));

    await page.goto("/resume");
    await page.goBack();
    await gridReady(page);
    await expect(page.locator(`[data-slug="${slug}"]`)).toBeVisible();
  });
});
