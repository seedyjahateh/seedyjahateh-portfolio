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
   * Reduced motion, for the whole file.
   *
   * Snapping is a CSS transition, so every position read immediately after a
   * placement catches the window in flight — one assertion saw x = 0 for a
   * window that settles at 724. Emulating reduced motion collapses the
   * transition to nothing, which removes the race and exercises a configuration
   * real visitors use. The transition itself is covered by the fact that
   * `prefers-reduced-motion` is what disables it.
   */
  test.use({ reducedMotion: "reduce" });

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

    await openMenu(page, PROFILE);
    await page.locator(`${PROFILE} [data-window-place="right"]`).click();
    const placed = await offsetX(page, PROFILE);

    await page.goto("/contact");
    await page.waitForSelector("html[data-desktop-ready]", { state: "attached" });
    await page.goto("/");
    await desktopReady(page);

    expect(await offsetX(page, PROFILE)).toBe(placed);
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
