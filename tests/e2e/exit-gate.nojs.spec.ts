import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * The home heading is the authored display name, falling back to a generic
 * label while the profile is unwritten. Reading it from the profile rather than
 * hardcoding a string means this assertion stays true through authoring instead
 * of failing the first time a real name lands.
 */
const profile = JSON.parse(
  readFileSync(join(process.cwd(), "content", "profile.v1.json"), "utf8"),
) as { name: string };
const homeHeading = profile.name.trim().length > 0 ? profile.name.trim() : "Engineering archive";

/**
 * The Phase 1 exit gate, tested literally.
 *
 * PRD 13: "crawlable and keyboard-usable without client catalog code."
 * PRD 9.7: "Without JavaScript: home, role pages, project details, résumé,
 * writing, and a paginated project index remain usable."
 *
 * This whole file runs in a context with `javaScriptEnabled: false`. If any of
 * it fails, Phase 1 has not met its gate — regardless of how the site behaves
 * with scripting on.
 */

const ROUTES = [
  { path: "/", heading: homeHeading },
  { path: "/ai-engineer", heading: /ai engineer/i },
  { path: "/backend-engineer", heading: /backend engineer/i },
  { path: "/full-stack-engineer", heading: /full stack engineer/i },
  { path: "/projects", heading: /project atlas/i },
  { path: "/resume", heading: /résumé/i },
  { path: "/contact", heading: /contact/i },
];

test.describe("without JavaScript", () => {
  for (const route of ROUTES) {
    test(`${route.path} renders its content`, async ({ page }) => {
      const response = await page.goto(route.path);
      expect(response?.status(), `${route.path} should return 200`).toBe(200);

      const h1 = page.locator("h1");
      await expect(h1).toHaveCount(1);
      await expect(h1).toHaveText(route.heading);

      // Landmarks must exist without hydration.
      await expect(page.locator("main#main")).toBeVisible();
      await expect(page.locator("header")).toBeVisible();
      await expect(page.locator("footer")).toBeVisible();
    });
  }

  test("navigation between routes works via plain links", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Projects" })
      .click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.locator("h1")).toHaveText(/project atlas/i);
  });

  test("a project detail page is reachable from the atlas", async ({ page }) => {
    await page.goto("/projects");
    const firstProject = page.locator(".project-row h2 a").first();
    const title = await firstProject.textContent();
    await firstProject.click();
    await expect(page).toHaveURL(/\/projects\/[a-z0-9-]+$/);
    await expect(page.locator("h1")).toHaveText(title?.trim() ?? "");
  });

  test("pagination works", async ({ page }) => {
    await page.goto("/projects");
    const pagination = page.getByRole("navigation", { name: "Project index pages" });
    await expect(pagination).toBeVisible();
    await pagination.getByRole("link", { name: /page 2 of/i }).click();
    await expect(page).toHaveURL(/\/projects\/page\/2$/);
    await expect(page.locator(".project-row")).not.toHaveCount(0);
  });

  test("the résumé and contact routes are reachable from the header", async ({ page }) => {
    // PRD 6.2 item 6: these are the recruiter's exit paths and must not depend
    // on scripting.
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "Résumé" }).click();
    await expect(page).toHaveURL(/\/resume$/);

    await page.goto("/");
    await nav.getByRole("link", { name: "Contact" }).click();
    await expect(page).toHaveURL(/\/contact$/);
  });

  test("exposes no window controls, because none of them would work", async ({ page }) => {
    /**
     * The window frame is server-rendered, so its controls are in the HTML on
     * every route whether or not the manager ever runs. Without scripting they
     * do nothing, and a control that looks live and does nothing is worse than
     * no control — it is the one failure mode a progressive-enhancement layer
     * introduces that the layer itself cannot detect.
     *
     * Every rule that reveals them is gated on `[data-desktop-active]`, which
     * only `desktop-shell.ts` sets. This is what proves the gate holds.
     */
    await page.goto("/");

    await expect(page.locator("html")).not.toHaveAttribute("data-desktop-active", /.*/);
    await expect(page.locator("[data-window-action]").first()).toBeHidden();
    await expect(page.locator(".window__menu").first()).toBeHidden();

    // The content those windows hold is still perfectly readable.
    await expect(page.locator(".window__body").first()).toBeVisible();
  });
});
