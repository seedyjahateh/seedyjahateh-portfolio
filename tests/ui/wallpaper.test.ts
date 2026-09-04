/**
 * The wallpaper is bounded, and light-on-glass text passes because of it.
 *
 * Authority: ADR 0036, PRD 10.1 (`A11Y-CONTRAST-TEXT` = 4.5:1, "tokens are
 * tested in every theme").
 *
 * WHY THIS TEST EXISTS. Translucent glass has no fixed background: its effective
 * colour is the tint composited over whatever is behind it, and behind it is a
 * wallpaper that scrolls under moving windows. A contrast check against a token
 * pair cannot see that, so the usual token-level test would pass while real text
 * sat on an unreadable surface.
 *
 * ADR 0036 resolves it by constraining the backdrop rather than thickening the
 * glass: every wallpaper stop is held at or below a luminance cap, and against
 * that cap light text on dark glass clears 4.5:1 with room to spare. That
 * argument is only worth anything while it remains true, and the thing most
 * likely to break it is somebody brightening a gradient stop because it looked
 * better. This test is what makes that break the build instead of the site.
 *
 * It reads the shipped stylesheet rather than a copy of the numbers. A test that
 * restates the values it is checking agrees with every regression that changes
 * them.
 */

import { describe, expect, it } from "vitest";

import {
  CSS,
  contrast,
  hexToken as hex,
  luminance,
  over,
  scalar,
  triplet,
  type Rgb,
} from "./colour.js";

/** `--glass-tint: rgb(12 14 22 / 0.55);` -> tint and alpha. */
function glassTint(): { rgb: Rgb; alpha: number } {
  const match = /--glass-tint:\s*rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\)\s*;/.exec(CSS);
  if (match === null) throw new Error("no --glass-tint in globals.css");
  return {
    rgb: [Number(match[1]), Number(match[2]), Number(match[3])] as const,
    alpha: Number(match[4]),
  };
}

/** Every stop declared in the token block, by name. */
function wallpaperStops(): { name: string; rgb: Rgb }[] {
  const names = [...CSS.matchAll(/--(wallpaper-stop-\d+):/g)].map((m) => m[1]!);
  expect(names.length, "no wallpaper stops found - did the token names change?").toBeGreaterThan(2);
  return names.map((name) => ({ name, rgb: triplet(name) }));
}

describe("wallpaper luminance is capped", () => {
  it("holds every stop at or below the declared cap", () => {
    const cap = scalar("wallpaper-luminance-cap");
    for (const stop of wallpaperStops()) {
      expect(
        luminance(stop.rgb),
        `--${stop.name} is brighter than the cap. ADR 0036 depends on this ceiling: ` +
          `raising it silently weakens every contrast guarantee on the desktop.`,
      ).toBeLessThanOrEqual(cap);
    }
  });

  it("uses every declared stop in the wallpaper gradient", () => {
    // A stop that nothing references would be capped by the test above while
    // the gradient painted something else entirely.
    const wallpaper = /--wallpaper:([\s\S]*?);\n/.exec(CSS)?.[1] ?? "";
    expect(wallpaper.length, "no --wallpaper gradient found").toBeGreaterThan(0);
    for (const stop of wallpaperStops()) {
      expect(wallpaper, `--${stop.name} is declared but never used`).toContain(stop.name);
    }
  });
});

describe("text on glass passes 4.5:1 over the worst backdrop the wallpaper allows", () => {
  /**
   * The lightest stop is the worst case for light text: the more of the
   * backdrop that shows through, the closer the surface gets to the text.
   */
  function lightestStop(): Rgb {
    return wallpaperStops()
      .map((s) => s.rgb)
      .reduce((worst, rgb) => (luminance(rgb) > luminance(worst) ? rgb : worst));
  }

  it("keeps body text on glass above 4.5:1", () => {
    const { rgb, alpha } = glassTint();
    const surface = over(rgb, alpha, lightestStop());
    expect(contrast(hex("glass-text"), surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps muted text on glass above 4.5:1", () => {
    // Muted is the one that goes first, and it is used for menu-bar and dock
    // labels — the smallest text on the most transparent surfaces.
    const { rgb, alpha } = glassTint();
    const surface = over(rgb, alpha, lightestStop());
    expect(contrast(hex("glass-text-muted"), surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("still passes if the glass were fully transparent", () => {
    /**
     * The claim in ADR 0036 is stronger than "the current tint works": it is
     * that the capped backdrop alone carries the contrast, so the tint is a
     * design choice rather than a load-bearing one. If this fails, thinning the
     * glass becomes an accessibility regression and the ADR needs rewriting.
     */
    expect(contrast(hex("glass-text"), lightestStop())).toBeGreaterThanOrEqual(4.5);
  });
});

describe("text on glass passes over ANY backdrop, including white", () => {
  /**
   * The wallpaper cap is not the whole guarantee, and assuming it was is a
   * mistake this suite now prevents.
   *
   * Glass is only ever over the wallpaper while nothing can get between them.
   * Windows are draggable, so they overlap: a title bar dragged across another
   * window sits on that window's opaque body, which is near-white in the light
   * theme. The first build of the desktop failed axe at 3.88:1 for exactly this
   * reason, and the useful part of that failure was that it was reported against
   * white — the true worst case, not a tooling artefact.
   *
   * So the tint has to hold against white with nothing behind it, which is the
   * strongest form of the claim and the one that does not depend on what any
   * checker can resolve about a gradient.
   */
  const WHITE: Rgb = [255, 255, 255];

  it("keeps body text on glass above 4.5:1 over white", () => {
    const { rgb, alpha } = glassTint();
    expect(contrast(hex("glass-text"), over(rgb, alpha, WHITE))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps muted text on glass above 4.5:1 over white", () => {
    const { rgb, alpha } = glassTint();
    expect(contrast(hex("glass-text-muted"), over(rgb, alpha, WHITE))).toBeGreaterThanOrEqual(4.5);
  });
});
