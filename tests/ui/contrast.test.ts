/**
 * The document palette, tested in every theme.
 *
 * Authority: PRD 10.1 — `A11Y-CONTRAST-TEXT` 4.5:1, `A11Y-CONTRAST-LARGE` 3:1,
 * and "tokens are tested in every theme", which until now was a sentence rather
 * than a test.
 *
 * WHAT WAS THERE BEFORE. A comment at the top of the token block listing four
 * ratios: `--text on --bg 15.8:1`, `--text-muted 7.0:1`, `--link 7.4:1`,
 * `--border 3.1:1`. Numbers in a comment are a claim about a past state. They
 * do not recompute when someone changes a hex, they say nothing about the dark
 * theme at all, and there was no dark-theme figure among them — for a palette
 * that defines thirteen colours twice.
 *
 * `tests/e2e/accessibility.spec.ts` does run axe's `color-contrast` rule in
 * both themes, but only against `/projects`, and only against text that
 * happens to be on screen. A token pair used by one component on one route can
 * fail for a long time before anything renders it under a checker.
 *
 * So this asserts the pairs directly, from the shipped stylesheet, per theme.
 */

import { describe, expect, it } from "vitest";

import { contrast, themeBlocks, tokenIn, type Rgb } from "./colour.js";

const THEMES = ["light", "dark"] as const;

/**
 * Pairs that must hold, and the surface each is actually used on.
 *
 * `--bg` is the page; `--bg-raised` is a card, a row, and — since the desktop
 * landed — every window body, which is where most reading now happens. A
 * palette checked only against the page background misses all of it.
 */
const TEXT_PAIRS: readonly { fg: string; bg: string }[] = [
  { fg: "text", bg: "bg" },
  { fg: "text", bg: "bg-raised" },
  { fg: "text", bg: "bg-sunken" },
  { fg: "text-muted", bg: "bg" },
  { fg: "text-muted", bg: "bg-raised" },
  { fg: "text-muted", bg: "bg-sunken" },
  { fg: "link", bg: "bg" },
  { fg: "link", bg: "bg-raised" },
  { fg: "link-visited", bg: "bg" },
  { fg: "link-visited", bg: "bg-raised" },
];

/**
 * Non-text contrast (WCAG 1.4.11): a boundary or a focus ring carries meaning,
 * so 3:1 rather than 4.5:1, but not nothing. `--border` is what separates one
 * card from the next, and `--focus` is the only thing telling a keyboard user
 * where they are.
 */
const UI_PAIRS: readonly { fg: string; bg: string }[] = [
  { fg: "border", bg: "bg" },
  { fg: "border", bg: "bg-raised" },
  { fg: "border-strong", bg: "bg" },
  { fg: "focus", bg: "bg" },
  { fg: "focus", bg: "bg-raised" },
];

describe("document palette contrast", () => {
  const themes = themeBlocks();

  for (const theme of THEMES) {
    const read = (name: string): Rgb => tokenIn(themes, theme, name);

    describe(`${theme} theme`, () => {
      it.each(TEXT_PAIRS)("--$fg on --$bg is at least 4.5:1", ({ fg, bg }) => {
        const ratio = contrast(read(fg), read(bg));
        expect(
          Number(ratio.toFixed(2)),
          `--${fg} on --${bg} in the ${theme} theme is ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      });

      it.each(UI_PAIRS)("--$fg on --$bg is at least 3:1", ({ fg, bg }) => {
        const ratio = contrast(read(fg), read(bg));
        expect(
          Number(ratio.toFixed(2)),
          `--${fg} on --${bg} in the ${theme} theme is ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(3);
      });
    });
  }

  it("defines a dark value for every colour the light theme defines", () => {
    /**
     * The dark block deliberately overrides "only what changes", so a token
     * inherited from light is fine — but only if it is legible on a dark
     * background, which the pairs above check. What this catches is the other
     * failure: a NEW light token added without anyone asking what it should be
     * in the dark, which is how a palette drifts into being half-themed.
     */
    const declared = (source: string): Set<string> =>
      new Set([...source.matchAll(/--([a-z-]+):\s*#[0-9a-f]{6}\s*;/gi)].map((m) => m[1]!));

    const light = declared(themes.light);
    const dark = declared(themes.dark);
    const missing = [...light].filter((name) => !dark.has(name));

    // Anything intentionally shared between themes belongs here, with a reason.
    const shared = new Set<string>(["glass-text", "glass-text-muted"]);
    expect(
      missing.filter((name) => !shared.has(name)),
      "these colours have no dark-theme value; add one or add them to `shared`",
    ).toEqual([]);
  });
});
