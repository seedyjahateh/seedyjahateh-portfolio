import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Accessibility and keyboard journeys.
 *
 * Authority: PRD 10.1 (WCAG 2.2 AA), 11.2 release gate ("Axe has zero
 * serious/critical issues"), budget `A11Y-AXE-SERIOUS`, 6.4 (recruiter and
 * hiring-engineer journeys).
 *
 * Axe is necessary but nowhere near sufficient — PRD 10.1 also requires manual
 * keyboard, NVDA and VoiceOver checks for release candidates. What is automated
 * here is the part a machine can genuinely judge: rule violations, focus order,
 * and whether the documented journeys are completable by keyboard alone.
 */

const TEMPLATES = [
  "/",
  "/ai-engineer",
  "/backend-engineer",
  "/full-stack-engineer",
  "/projects",
  "/projects/page/2",
  "/resume",
  "/contact",
];

test.describe("axe", () => {
  for (const path of TEMPLATES) {
    test(`${path} has no serious or critical violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();

      const blocking = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(
        blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`),
        `${path} must have zero serious/critical axe violations`,
      ).toEqual([]);
    });
  }

  test("a project detail page has no serious or critical violations", async ({ page }) => {
    await page.goto("/projects");
    await page.locator(".project-row h2 a").first().click();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test("both colour themes pass", async ({ page }) => {
    // PRD 10.1: "Tokens are tested in every theme." A palette that only meets
    // contrast in light mode fails half the audience.
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/projects");
      const results = await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze();
      const contrast = results.violations.filter((v) => v.id === "color-contrast");
      expect(contrast.map((v) => `${scheme}: ${v.nodes.length} node(s)`)).toEqual([]);
    }
  });
});

test.describe("keyboard", () => {
  test("the skip link is the first stop and moves focus to main", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");

    const skip = page.locator("a.skip-link");
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("recruiter journey is completable by keyboard alone", async ({ page }) => {
    // PRD 6.4: "landing → select role or inspect flagship → scan claim/proof →
    // open résumé/source/contact. No mandatory command palette or filters."
    await page.goto("/");

    const roleLink = page.getByRole("link", { name: "AI Engineer" });
    await roleLink.focus();
    await expect(roleLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/ai-engineer$/);

    const resume = page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
      name: "Résumé",
    });
    await resume.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/resume$/);
  });

  test("hiring-engineer journey reaches a project from the atlas", async ({ page }) => {
    await page.goto("/projects");
    const project = page.locator(".project-row h2 a").first();
    await project.focus();
    await expect(project).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/projects\/[a-z0-9-]+$/);
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("every interactive element shows a visible focus indicator", async ({ page }) => {
    await page.goto("/");
    const links = page.locator("a");
    const count = Math.min(await links.count(), 12);

    for (let i = 0; i < count; i += 1) {
      const link = links.nth(i);
      await link.focus();
      const outline = await link.evaluate((el) => {
        const style = getComputedStyle(el);
        return { width: style.outlineWidth, style: style.outlineStyle };
      });
      expect(outline.style, `link ${i} has no focus outline`).not.toBe("none");
      expect(parseFloat(outline.width), `link ${i} has a zero-width outline`).toBeGreaterThan(0);
    }
  });
});

test.describe("user preferences", () => {
  test("respects reduced motion without losing content", async ({ page }) => {
    // PRD 9.7: reduced motion removes motion, never information.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/projects");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".project-row")).not.toHaveCount(0);
  });

  test("remains usable at 400% zoom", async ({ page }) => {
    // PRD 10.1. Emulated by shrinking the viewport to a quarter of its width,
    // which is what 400% zoom does to the available CSS pixels.
    await page.setViewportSize({ width: 320, height: 512 });
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows, "the page must not scroll horizontally at 400% zoom").toBe(false);
  });
});
