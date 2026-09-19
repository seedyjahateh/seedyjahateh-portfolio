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

  test("marks no current route, which is the known cost of doing it in script", async ({
    page,
  }) => {
    /**
     * A test for an ABSENCE, deliberately.
     *
     * `aria-current` on the primary navigation is set by an inline script,
     * because the layout is handed no pathname in a static export and the
     * navigation lives in the layout. The pagination a few files away renders
     * the same attribute on the server, and can, because a page component knows
     * its own page number.
     *
     * So with scripting off nothing is marked. That is a real gap and it is
     * written down here rather than left to be discovered: it is the one part
     * of this navigation that is not progressive enhancement, and pinning it
     * means a future server-rendered version fails this test loudly instead of
     * quietly making the comment above wrong.
     *
     * Nothing a visitor needs is lost. Every link works, and every route still
     * names itself in its own `h1`.
     */
    await page.goto("/projects");

    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.locator("a[aria-current]")).toHaveCount(0);

    // The pagination's own `aria-current` IS server-rendered, and still is.
    await expect(
      page
        .getByRole("navigation", { name: "Project index pages" })
        .locator('a[aria-current="page"]'),
    ).toHaveCount(1);
  });
});
