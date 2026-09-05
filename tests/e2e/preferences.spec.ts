/**
 * The user-preference media queries, actually run.
 *
 * Authority: PRD 10.1 (forced colors, "tokens are tested in every theme"), 9.7
 * (a preference removes an effect, never information), ADR 0036 (glass is an
 * enhancement and must be removable).
 *
 * WHY THIS EXISTS. globals.css has carried three preference blocks —
 * `prefers-reduced-transparency`, `prefers-contrast` and `forced-colors` — and
 * a print block, and not one line of any of them had ever been executed by a
 * test. They were written, reviewed, and assumed.
 *
 * They were also mostly inert. `[data-desktop-active]` raised the specificity
 * of every desktop rule when the desktop landed, and the preference blocks kept
 * targeting bare classes written before it. Measured in a browser:
 * `forced-colors: active` left `blur(24px)` on the menu bar, the window bars
 * and the dock; `prefers-reduced-transparency: reduce` cleared the menu bar and
 * the window bars but not the dock, which is two attribute selectors deep; and
 * `@media print` could not hide the dock or lighten the page background.
 *
 * A media query does not win a cascade. That is the whole lesson here, and the
 * reason these are assertions now rather than intentions: the blocks are for
 * people who cannot use the effect, so "it looks right on my machine" is not
 * evidence about any of them.
 *
 * Every check collects ALL offending surfaces and asserts the list is empty,
 * rather than failing on the first one. A preference that has regressed has
 * usually regressed everywhere, and one name at a time is a slow way to find
 * that out.
 */

import { expect, test, type CDPSession, type Page } from "@playwright/test";

/** Every surface that paints glass when the desktop is on. */
const GLASS = [
  ".site-header",
  ".site-footer",
  'nav[aria-label="Primary"] > ul',
  ".window__bar",
] as const;

/**
 * Emulated through CDP rather than `page.emulateMedia`.
 *
 * `prefers-reduced-transparency` has no Playwright option in this version, and
 * driving one preference through CDP and the others through the public API
 * would mean two mechanisms with different reset behaviour in one file. One
 * call replaces the whole feature list, which is what makes each scenario
 * independent.
 */
async function prefer(cdp: CDPSession, name: string, value: string): Promise<void> {
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name, value }] });
}

async function desktopReady(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.waitForSelector("html[data-desktop-ready]", { state: "attached" });
}

/**
 * Which glass surfaces are still glass — blurred, translucent, or both.
 *
 * Both, deliberately. Dropping `backdrop-filter` and leaving a 0.75-alpha tint
 * would pass a blur-only check while the chrome was still see-through, and
 * "reduced transparency" is a request about transparency, not about blur. The
 * alpha is what the preference is named after.
 */
async function stillGlass(page: Page): Promise<string[]> {
  return page.evaluate(
    (selectors) => {
      const out: string[] = [];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el === null) {
          out.push(`${selector} (missing — the selector is stale, not the rule)`);
          continue;
        }
        const style = getComputedStyle(el);
        const filter = style.backdropFilter;
        if (filter !== "none" && filter !== "") out.push(`${selector} → blur ${filter}`);

        // `rgba(r, g, b, a)` — anything short of 1 is see-through. A computed
        // `rgb(...)` has no alpha component and is opaque by definition.
        const alpha = /rgba?\([^)]*,\s*([\d.]+)\s*\)/.exec(style.backgroundColor)?.[1];
        if (alpha !== undefined && Number(alpha) < 1) {
          out.push(`${selector} → translucent ${style.backgroundColor}`);
        }
      }
      return out;
    },
    GLASS as unknown as string[],
  );
}

test.describe("user preferences", () => {
  test("reduced transparency makes every glass surface opaque", async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await desktopReady(page);
    await prefer(cdp, "prefers-reduced-transparency", "reduce");

    expect(await stillGlass(page)).toEqual([]);

    // And the wallpaper goes with it: a gradient behind opaque chrome is paint
    // nobody asked for.
    const wallpaper = await page.evaluate(
      () => getComputedStyle(document.body, "::before").backgroundImage,
    );
    expect(wallpaper, "the wallpaper is still painting under reduced transparency").toBe("none");
  });

  test("increased contrast makes every glass surface opaque", async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await desktopReady(page);
    await prefer(cdp, "prefers-contrast", "more");

    expect(await stillGlass(page)).toEqual([]);
  });

  test("forced colors makes every glass surface opaque and keeps the icons", async ({
    page,
    context,
  }) => {
    const cdp = await context.newCDPSession(page);
    await desktopReady(page);
    await prefer(cdp, "forced-colors", "active");

    expect(await stillGlass(page)).toEqual([]);

    /**
     * The dock icons are a mask painted with a background colour, and forced
     * colors rewrites every background to Canvas — which would leave nine
     * invisible glyphs holding nine tiles open. `forced-color-adjust: none`
     * plus a system colour is the only way to keep a masked icon, so this
     * asserts the glyph is drawn in something other than the page's own
     * background.
     */
    const icon = await page.evaluate(() => {
      const link = document.querySelector('nav[aria-label="Primary"] a');
      if (link === null) return null;
      const before = getComputedStyle(link, "::before");
      return {
        mask: before.maskImage || before.webkitMaskImage,
        colour: before.backgroundColor,
        canvas: getComputedStyle(document.body).backgroundColor,
      };
    });
    expect(icon, "no dock link to read").not.toBeNull();
    expect(icon!.mask, "the dock icons lost their mask").not.toBe("none");
    expect(icon!.colour, "the dock icons are painted in the page background colour").not.toBe(
      icon!.canvas,
    );
  });

  test("printing drops the chrome and lightens the page", async ({ page }) => {
    await desktopReady(page);
    await page.emulateMedia({ media: "print" });

    /**
     * The dock is `display: flex` behind two attribute selectors, so the print
     * block's bare `.site-nav` could not hide it — a fixed tray would have
     * landed on every printed page.
     */
    const nav = await page.evaluate(
      () => getComputedStyle(document.querySelector('nav[aria-label="Primary"]')!).display,
    );
    expect(nav, "the dock prints").toBe("none");

    // A résumé printed on a near-black wallpaper is not a résumé anyone sends.
    const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(body, "the page prints on the desktop wallpaper").toBe("rgb(255, 255, 255)");
  });
});
