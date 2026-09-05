/**
 * The window manager.
 *
 * Authority: ADR 0036, PRD 10.1 (WCAG 2.2 AA), 9.3 (no per-item listeners),
 * 9.1 (`INP`, `CLS`).
 *
 * The first three tests are the ones that matter. WCAG 2.2 SC 2.5.7 requires a
 * single-pointer equivalent for every dragging operation, and the failure mode
 * is not that the alternative breaks — it is that it never gets built, or gets
 * built and then quietly stops working while the drag keeps everyone happy. So
 * the menu and the keyboard are asserted first and independently of the drag,
 * by operating them, not by checking that the markup exists.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { installLayoutProbe, readLayoutProbe, resetLayoutProbe } from "./layout-probe.js";

const WINDOW = ".window";
const PROFILE = '[data-window="profile"]';
const HANDLE = "[data-window-handle]";

async function desktopReady(page: Page): Promise<void> {
  await page.waitForSelector("html[data-desktop-ready]", { state: "attached" });
  await expect(page.locator(PROFILE)).toBeVisible();
}

/**
 * Where a window actually sits, relative to the surface.
 *
 * Read from the rendered box rather than the inline `transform`, because most
 * windows do not have one: CSS grid places them by default and only a window
 * someone has moved carries inline geometry. Measuring the box is also the
 * better assertion — it is where the window is, not what a style string claims.
 */
async function offsetX(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const node = document.querySelector<HTMLElement>(sel);
    const host = document.querySelector<HTMLElement>(".desktop-surface");
    if (node === null || host === null) return Number.NaN;
    return Math.round(node.getBoundingClientRect().left - host.getBoundingClientRect().left);
  }, selector);
}

async function openMenu(page: Page, windowSelector: string): Promise<void> {
  await page.locator(`${windowSelector} .window__menu summary`).click();
  await expect(page.locator(`${windowSelector} .window__menu[open]`)).toHaveCount(1);
}

test.describe("window manager", () => {
  /**
   * Reduced motion, for every test here.
   *
   * Snapping is a CSS transition, so a position read immediately after a
   * placement catches the window in flight — one assertion saw x = 0 for a
   * window that settles at 724. Reduced motion collapses the transition, which
   * removes the race and exercises a configuration real visitors use.
   *
   * Applied through `emulateMedia` rather than `test.use({ reducedMotion })`:
   * the latter is not in this Playwright version's describe-scope option type
   * and fails `pnpm typecheck` — which passed locally and failed on CI, because
   * the local run had not rebuilt the e2e project's types.
   */
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("splits the home route into several windows", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await desktopReady(page);
    // Without more than one window, z-order and raise-to-front are decoration.
    expect(await page.locator(WINDOW).count()).toBeGreaterThan(2);
  });

  test("every position is reachable without dragging", async ({ page }) => {
    /**
     * SC 2.5.7. Asserted by operating the menu, not by finding it: a menu that
     * renders and does nothing satisfies a markup check and no visitor.
     */
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await desktopReady(page);

    const before = await offsetX(page, PROFILE);
    await openMenu(page, PROFILE);
    await page.locator(`${PROFILE} [data-window-place="right"]`).click();

    // Polled: snapping is a CSS transition, so the box is in flight for 160 ms.
    await expect
      .poll(async () => offsetX(page, PROFILE), { timeout: 3000 })
      .toBeGreaterThan(before);
    // And the menu closes on choice, the way a menu does.
    await expect(page.locator(`${PROFILE} .window__menu[open]`)).toHaveCount(0);

    await openMenu(page, PROFILE);
    await page.locator(`${PROFILE} [data-window-place="reset"]`).click();
    await expect.poll(async () => offsetX(page, PROFILE), { timeout: 3000 }).toBe(before);
  });

  test("a window can be moved by keyboard alone", async ({ page }) => {
    // SC 2.1.1. No pointer is used anywhere in this test.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await desktopReady(page);

    const before = await offsetX(page, PROFILE);
    await page.locator(`${PROFILE} [data-window-action="minimize"]`).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => offsetX(page, PROFILE), { timeout: 3000 })
      .toBeGreaterThan(before);

    // Shift is the coarse step, so it must move further than a bare press.
    // `fine` is safe to read directly: the poll above only returned once the
    // position had settled.
    const fine = await offsetX(page, PROFILE);
    await page.keyboard.press("Shift+ArrowRight");
    await expect
      .poll(async () => (await offsetX(page, PROFILE)) - fine, { timeout: 3000 })
      .toBeGreaterThan(16);
  });

  test("dragging a window forces no synchronous layout", async ({ page }) => {
    /**
     * PRD 9.3 forbids read/write interleaving, and window-manager.ts opens by
     * saying it never reads layout on pointermove:
     *
     *   "GEOMETRY IS A TRANSFORM, NEVER A LAYOUT PROPERTY ... The single place
     *    this file reads layout is `relayout`, which runs on load and on resize
     *    — never on pointermove, and never on scroll."
     *
     * That was not true. `onPointerMove` called `clamp`, and `clamp` read
     * `surface.clientWidth` — after the previous move had already written a
     * transform. One forced synchronous layout per pointer event, in the one
     * code path where a dropped frame is visible as the window lagging the
     * cursor. The claim was in a comment, so nothing disagreed with it.
     *
     * The budget named for this is `FORCED-LAYOUTS-SCROLL`, whose scope is
     * scroll, so this belongs here rather than in the perf harness: it is the
     * same defect class in the interaction the desktop is actually about.
     */
    await installLayoutProbe(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await desktopReady(page);

    const bar = page.locator(`${PROFILE} ${HANDLE}`);
    const box = await bar.boundingBox();
    expect(box).not.toBeNull();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();

    // Load is not the subject; the gesture is. Reset once the pointer is down
    // and the lift has happened, so what follows is pointermove and nothing else.
    await page.mouse.move(cx + 4, cy + 2);
    await resetLayoutProbe(page);

    for (let i = 1; i <= 24; i += 1) {
      await page.mouse.move(cx + 4 + i * 6, cy + 2 + i * 2);
    }

    /**
     * Read BEFORE the release, because the two halves of a drag are different
     * claims and only one of them is about frame rate.
     *
     * Every pointermove writes a transform, so a read on that path is a forced
     * layout per event while the window is following the cursor. That is the
     * one that has to be zero, and the assertion is not weakened to accommodate
     * anything: `writes` proves the gesture actually wrote geometry, so a zero
     * here cannot come from a drag that never happened.
     */
    const moving = await readLayoutProbe(page);
    expect(moving.writes, "the drag wrote no geometry, so nothing was measured").toBeGreaterThan(
      10,
    );
    expect(
      moving.forced,
      `${moving.forced} forced synchronous layouts across 24 pointer moves. Caused by:\n${moving.where.join("\n")}`,
    ).toBe(0);

    await resetLayoutProbe(page);
    await page.mouse.up();

    /**
     * Releasing settles: `relayout` re-clamps the window and re-measures the
     * surface's minimum height, and the last move's transform is still
     * unflushed, so one flush is unavoidable and costs a fraction of a
     * millisecond with the pointer already up.
     *
     * ONE is the assertion, not "a few". `relayout` batches — every write, then
     * every read — so the flush count does not scale with the number of
     * windows. Interleaved, as it was, four windows meant four. That is what
     * this number is guarding.
     */
    const released = await readLayoutProbe(page);
    expect(
      released.forced,
      `releasing forced ${released.forced} layouts; batching should make it at most one whatever the window count. Caused by:\n${released.where.join("\n")}`,
    ).toBeLessThanOrEqual(1);
  });

  test("minimize collapses the body and says so", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await desktopReady(page);

    const body = page.locator(`${PROFILE} .window__body`);
    const button = page.locator(`${PROFILE} [data-window-action="minimize"]`);
    await expect(button).toHaveAttribute("aria-expanded", "true");

    await button.click();
    await expect(body).toBeHidden();
    await expect(button).toHaveAttribute("aria-expanded", "false");

    await button.click();
    await expect(body).toBeVisible();
    await expect(button).toHaveAttribute("aria-expanded", "true");
  });

  test("dragging the title bar moves the window", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await desktopReady(page);

    const before = await offsetX(page, PROFILE);
    const bar = page.locator(`${PROFILE} ${HANDLE}`);
    const box = await bar.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 120, box!.y + box!.height / 2 + 40, {
      steps: 8,
    });

    /**
     * Mid-gesture, before the pointer is released. ADR 0036 requires the blur to
     * drop for the duration of a drag — compositing a blurred surface every
     * frame is what turns a 150 ms `INP` budget into a slideshow. Asserted here
     * rather than in the perf harness because the harness measures at rest and
     * would never see it.
     */
    const filter = await page.evaluate(
      (sel) => getComputedStyle(document.querySelector(sel)!).backdropFilter,
      `${PROFILE} .window__bar`,
    );
    expect(filter, "a dragged window must not blur its backdrop").toBe("none");

    await page.mouse.up();
    await expect
      .poll(async () => offsetX(page, PROFILE), { timeout: 3000 })
      .toBeGreaterThan(before);
  });

  test("a minimized window spends no backdrop-filter budget", async ({ page }) => {
    /**
     * `BACKDROP-FILTER-SURFACES` counts every element in the document, hidden
     * ones included (runtime-budgets.perf.spec.ts). So a collapsed window whose
     * body is merely invisible still costs, and the budget would be spent on
     * surfaces nobody can see.
     */
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await desktopReady(page);
    await page.locator(`${PROFILE} [data-window-action="minimize"]`).click();

    const blurred = await page.evaluate(
      () =>
        [...document.querySelectorAll("*")].filter((el) => {
          const value = getComputedStyle(el).backdropFilter;
          return value !== "" && value !== "none";
        }).length,
    );
    expect(blurred, "a home desktop must stay inside BACKDROP-FILTER-SURFACES").toBeLessThanOrEqual(
      10,
    );
  });

  test("interacting with a window raises it above the others", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await desktopReady(page);

    const zOf = (sel: string): Promise<number> =>
      page.evaluate((s) => Number(document.querySelector<HTMLElement>(s)?.style.zIndex ?? 0), sel);

    const atlas = '[data-window="atlas"]';
    await page.locator(`${atlas} ${HANDLE}`).click();
    expect(await zOf(atlas)).toBeGreaterThan(await zOf(PROFILE));

    await page.locator(`${PROFILE} ${HANDLE}`).click();
    expect(await zOf(PROFILE)).toBeGreaterThan(await zOf(atlas));
  });

  test("adds the same number of listeners however many windows there are", async ({ page }) => {
    /**
     * PRD 9.3 forbids a listener per item, and the whole manager is delegated
     * from the surface. Counted rather than read from the source, because the
     * source is exactly what a refactor changes — the technique is the one
     * grid.spec.ts uses for ResizeObserver.
     */
    await page.addInitScript(() => {
      const w = window as unknown as { __surfaceListeners: number };
      w.__surfaceListeners = 0;
      // Captured on purpose, to re-invoke with an explicit receiver below.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const native = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (
        this: EventTarget,
        ...args: Parameters<typeof native>
      ) {
        if (this instanceof Element && this.classList.contains("desktop-surface")) {
          w.__surfaceListeners += 1;
        }
        return native.apply(this, args);
      };
    });

    const count = async (path: string): Promise<number> => {
      await page.goto(path);
      await page.waitForSelector("html[data-desktop-ready]", { state: "attached" });
      return page.evaluate(
        () => (window as unknown as { __surfaceListeners: number }).__surfaceListeners,
      );
    };

    await page.setViewportSize({ width: 1440, height: 1000 });
    const onHome = await count("/");
    const windowsOnHome = await page.locator(WINDOW).count();
    const onArchive = await count("/projects");
    const windowsOnArchive = await page.locator(WINDOW).count();

    expect(windowsOnHome).toBeGreaterThan(windowsOnArchive);
    expect(onHome, "listener count must not scale with window count").toBe(onArchive);
  });

  test("a moved window is still there after navigating away and back", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await desktopReady(page);

    const home = await offsetX(page, PROFILE);
    await openMenu(page, PROFILE);
    await page.locator(`${PROFILE} [data-window-place="right"]`).click();

    // Settle before recording. Reading straight after the click can capture a
    // position the window was only passing through, and then nothing matches it
    // after the reload — which is how this passed locally and failed on CI.
    await expect.poll(async () => offsetX(page, PROFILE), { timeout: 3000 }).toBeGreaterThan(home);
    const placed = await offsetX(page, PROFILE);

    await page.goto("/contact");
    await page.waitForSelector("html[data-desktop-ready]", { state: "attached" });
    await page.goto("/");
    await desktopReady(page);

    await expect(page.locator(PROFILE)).toHaveAttribute("data-window-placed", "");
    await expect.poll(async () => offsetX(page, PROFILE), { timeout: 3000 }).toBe(placed);
  });

  test("has no serious or critical axe violations with a menu open", async ({ page }) => {
    // Following palette.spec.ts: axe runs against the populated state, because
    // the rules that matter here have nothing to catch on a closed menu.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await desktopReady(page);
    await openMenu(page, PROFILE);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test("is not a desktop below the breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto("/");
    await page.waitForSelector("html[data-desktop-ready]", { state: "attached" });
    await expect(page.locator("html")).toHaveAttribute("data-desktop-mode", "springboard");

    // Inline geometry is stripped, so the windows are in document flow and the
    // page cannot scroll sideways — which is also what A11Y-ZOOM needs at 400%.
    const transform = await page.evaluate(
      (sel) => document.querySelector<HTMLElement>(sel)?.style.transform ?? "",
      PROFILE,
    );
    expect(transform).toBe("");
  });
});

/**
 * The dock and the springboard.
 *
 * One `<nav aria-label="Primary">` presented three ways. The tests that matter
 * are the two that would pass a markup review and fail in a browser: the dock
 * has to be anchored to the viewport, and it must not eat the clicks meant for
 * whatever is behind it.
 */
test.describe("primary navigation", () => {
  const DOCK = 'nav[aria-label="Primary"]';
  const TRAY = `${DOCK} > ul`;

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("there is exactly one of it, in every mode", async ({ page }) => {
    // A dock built as a copy of the navigation is the obvious implementation
    // and it breaks four tests, a screen reader, and nothing visible.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await desktopReady(page);
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(1);
    await expect(page.locator("header")).toHaveCount(1);

    await page.setViewportSize({ width: 430, height: 900 });
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(1);
  });

  test("the dock is anchored to the viewport, not to the menu bar", async ({ page }) => {
    /**
     * `backdrop-filter` on an ancestor makes that ancestor the containing block
     * for `position: fixed` descendants, exactly as `filter` and `transform` do.
     * The menu bar is glass, so a dock nested inside it would anchor to the
     * bottom of a 38px strip and look, from the markup, entirely correct.
     *
     * Scrolling is the second half of the assertion: an absolutely positioned
     * element at the right place on load is indistinguishable from a fixed one
     * until the page moves.
     */
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await desktopReady(page);

    const atRest = await page.locator(TRAY).boundingBox();
    expect(atRest).not.toBeNull();
    const bottomGap = 1000 - (atRest!.y + atRest!.height);
    expect(bottomGap, "the dock is not sitting on the bottom of the viewport").toBeLessThan(40);
    expect(bottomGap).toBeGreaterThan(0);

    await page.evaluate(() => window.scrollTo(0, 600));
    const scrolled = await page.locator(TRAY).boundingBox();
    expect(Math.round(scrolled!.y), "the dock scrolled with the page").toBe(Math.round(atRest!.y));
  });

  test("the dock does not swallow clicks meant for the page behind it", async ({ page }) => {
    /**
     * The `<nav>` spans the full width so the tray can centre itself in it. That
     * is an invisible full-width bar across the bottom of the screen, and
     * without `pointer-events: none` on it every click near the bottom edge of
     * a window would hit nothing at all — the worst kind of bug to find by eye,
     * because the page looks completely normal.
     */
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await desktopReady(page);

    const tray = (await page.locator(TRAY).boundingBox())!;
    const y = Math.round(tray.y + tray.height / 2);

    const onTray = await page.evaluate(
      (at) => document.elementFromPoint(at.x, at.y)?.closest("nav")?.getAttribute("aria-label"),
      { x: Math.round(tray.x + tray.width / 2), y },
    );
    expect(onTray, "the tray itself should take the pointer").toBe("Primary");

    const besideTray = await page.evaluate(
      (at) => document.elementFromPoint(at.x, at.y)?.closest("nav")?.getAttribute("aria-label"),
      { x: 40, y },
    );
    expect(besideTray, "the strip beside the tray is still taking clicks").not.toBe("Primary");
  });

  test("every tile has an icon", async ({ page }) => {
    // The glyph is a CSS mask on `::before`, so a typo in a data URI or a
    // missing `data-icon` produces a tile with a gap where the icon was and no
    // error anywhere.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await desktopReady(page);

    const missing = await page.evaluate((sel) => {
      const links = [...document.querySelectorAll<HTMLElement>(`${sel} a`)];
      return links
        .filter((a) => {
          const before = getComputedStyle(a, "::before");
          const mask = before.maskImage || before.webkitMaskImage;
          return !mask || mask === "none";
        })
        .map((a) => a.textContent?.trim() ?? "?");
    }, DOCK);
    expect(missing).toEqual([]);
  });

  test("becomes a springboard grid below the breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto("/");
    await page.waitForSelector("html[data-desktop-ready]", { state: "attached" });

    const tray = page.locator(TRAY);
    expect(await tray.evaluate((el) => getComputedStyle(el).display)).toBe("grid");
    // In flow, above the content: a fixed launcher would cover the document.
    expect(await page.locator(DOCK).evaluate((el) => getComputedStyle(el).position)).toBe("static");

    // SC 2.5.8, on the presentation where every target is a thumb.
    const tiles = await tray.locator("a").all();
    expect(tiles.length).toBeGreaterThan(6);
    for (const tile of tiles) {
      const box = (await tile.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(24);
      expect(box.height).toBeGreaterThanOrEqual(24);
    }
  });
});
