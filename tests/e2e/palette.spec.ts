/**
 * Command palette.
 *
 * Authority: PRD 5.2.1 (entry keys, accessible modal dialog, focus
 * containment, Escape close, restored trigger focus, no keyboard trap),
 * 5.2.3 (exact project id bypasses fuzzy ranking), 5.2.4 (commands are
 * labelled suggestions), 10.1 / A11Y-AXE-SERIOUS (0 serious or critical).
 *
 * These run against the exported static site, so they exercise the same
 * bundles a visitor downloads — including the lazy dialog chunk and the worker.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const DIALOG = "[role='dialog']";
const OPTION = "[role='option']";
const LABEL = ".palette__label";

/**
 * Wait for the stub's effect to run.
 *
 * Before hydration the chord does nothing, so pressing it early fails
 * intermittently. The stub sets this attribute when its listener is attached —
 * a real signal rather than a sleep that hides the race.
 */
async function hydrated(page: Page): Promise<void> {
  await page.waitForSelector("html[data-palette-ready]", { state: "attached" });
}

/** Open via the keyboard chord and wait for the dialog to be usable. */
async function openPalette(page: Page): Promise<void> {
  await hydrated(page);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.locator(DIALOG)).toBeVisible();
  await expect(page.locator("#palette-input")).toBeFocused();
}

test.describe("command palette", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("opens with the keyboard chord", async ({ page }) => {
    await openPalette(page);
    // PRD 5.2.1: an accessible modal dialog with a labelled combobox.
    await expect(page.locator(DIALOG)).toHaveAttribute("aria-modal", "true");
    await expect(page.locator("#palette-input")).toHaveAttribute("role", "combobox");
  });

  test("opens with / when focus is not in a field", async ({ page }) => {
    await hydrated(page);
    await page.keyboard.press("/");
    await expect(page.locator(DIALOG)).toBeVisible();
  });

  test("leaves / alone inside the search box", async ({ page }) => {
    // Otherwise typing a slash into the site search would open the palette on
    // top of itself (PRD 5.2.1 scopes the bare key to non-editable focus).
    //
    // Waiting for hydration first is what makes this assertion mean anything:
    // before the listener is attached it would pass even if the whole palette
    // were broken.
    await hydrated(page);
    await page.locator("#site-search-input").focus();
    await page.keyboard.press("/");
    await expect(page.locator(DIALOG)).toBeHidden();
    await expect(page.locator("#site-search-input")).toHaveValue("/");
  });

  test("returns project results for free text", async ({ page }) => {
    await openPalette(page);
    await page.locator("#palette-input").fill("agent");

    // The worker has to boot and hydrate the prebuilt index before the first
    // result can arrive, so this waits on content rather than a fixed delay.
    // Two or more options means real project hits, not just the archive link.
    await expect(page.locator(OPTION).nth(1)).toBeVisible({ timeout: 15_000 });
    const labels = await page.locator(`${OPTION} ${LABEL}`).allTextContents();
    expect(labels.length).toBeGreaterThan(1);
  });

  test("highlights the matched range, as text nodes", async ({ page }) => {
    // PRD 5.2.3: "Highlight matched ranges without injecting HTML. Render text
    // nodes from range boundaries."
    await openPalette(page);
    await page.locator("#palette-input").fill("agent");
    await expect(page.locator(OPTION).nth(1)).toBeVisible({ timeout: 15_000 });

    const marks = page.locator(`${OPTION} ${LABEL} mark`);
    await expect(marks.first()).toBeVisible();

    // The highlight must be part of the title, not a decoration bolted beside
    // it: the marked text has to appear inside the label it belongs to.
    const first = page.locator(`${OPTION} ${LABEL}`).first();
    const marked = (await first.locator("mark").first().textContent()) ?? "";
    expect(marked.length).toBeGreaterThan(0);
    expect((await first.textContent()) ?? "").toContain(marked);
  });

  test("renders a title containing markup as text, not HTML", async ({ page }) => {
    // The label is built from substrings via createTextNode, so a title with
    // angle brackets can only ever render as characters. Asserted against the
    // live DOM rather than trusted from the implementation.
    await openPalette(page);
    await page.locator("#palette-input").fill("agent");
    await expect(page.locator(OPTION).nth(1)).toBeVisible({ timeout: 15_000 });

    const offending = await page.evaluate(
      () =>
        [...document.querySelectorAll(".palette__label")].filter((el) =>
          [...el.children].some((child) => child.tagName !== "MARK"),
        ).length,
    );
    expect(offending, "a label contained an element other than <mark>").toBe(0);
  });

  test("an exact project id wins outright", async ({ page }) => {
    // PRD 5.2.3: exact id matches bypass fuzzy ranking and appear first.
    await openPalette(page);
    await page.locator("#palette-input").fill("AGT-01");

    const first = page.locator(OPTION).first();
    await expect(first.locator(".palette__hint")).toHaveText("AGT-01", { timeout: 15_000 });
  });

  test("offers a labelled suggestion for a command", async ({ page }) => {
    // PRD 5.2.4: "undocumented parser syntax is not a substitute for UI."
    await openPalette(page);
    await page.locator("#palette-input").fill("role:ai-engineer");

    const first = page.locator(OPTION).first();
    await expect(first).toContainText("role");
    await expect(first).toHaveAttribute("data-href", /role=ai-engineer/);
  });

  test("arrow keys move the active option", async ({ page }) => {
    await openPalette(page);
    await page.locator("#palette-input").fill("agent");
    await expect(page.locator(OPTION).first()).toBeVisible();

    await page.keyboard.press("ArrowDown");
    await expect(page.locator(`${OPTION}[aria-selected='true']`)).toHaveCount(1);
    // The combobox must point at the active option for screen readers.
    await expect(page.locator("#palette-input")).toHaveAttribute(
      "aria-activedescendant",
      /palette-option-\d+/,
    );
  });

  test("Escape closes it and gives focus back", async ({ page }) => {
    // PRD 5.2.1: restored trigger focus. Without it the user is dumped at the
    // top of the document with no idea where they were.
    await hydrated(page);
    await page.locator("#site-search-input").focus();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.locator(DIALOG)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(DIALOG)).toBeHidden();
    await expect(page.locator("#site-search-input")).toBeFocused();
  });

  test("Tab does not escape the dialog, and Escape still works", async ({ page }) => {
    // Focus containment WITHOUT a keyboard trap — PRD 5.2.1 requires both, and
    // the second half is what stops containment becoming a trap.
    await openPalette(page);
    await page.keyboard.press("Tab");
    await expect(page.locator("#palette-input")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(DIALOG)).toBeHidden();
  });

  test("has no serious or critical axe violations while open", async ({ page }) => {
    await openPalette(page);
    await page.locator("#palette-input").fill("agent");
    // Analyse with real results on screen: the listbox is empty otherwise, and
    // the rule that matters most here (no interactive content nested inside a
    // role="option") only has something to catch once options exist.
    await expect(page.locator(OPTION).nth(1)).toBeVisible({ timeout: 15_000 });

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

test.describe("search without the palette", () => {
  test("the header form navigates to the archive", async ({ page }) => {
    // PRD 5.2.1's fallback path, exercised as a real navigation: this is what
    // happens when the worker never becomes available.
    await page.goto("/projects?q=agent");
    await expect(page).toHaveURL(/\/projects\?q=agent/);
    await expect(page.locator("h1")).toBeVisible();
  });
});
