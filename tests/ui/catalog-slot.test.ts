/**
 * The archive's height reservation agrees with the height it is reserving for.
 *
 * Authority: PRD 9.1 (`CLS` <= 0.05), 9.7 (the static index is the degraded
 * state and is never removed from the markup).
 *
 * WHY THIS EXISTS. `/projects` renders two things: a server-rendered paginated
 * index, and a client catalog island that replaces it. The island returns
 * `null` until the catalog has loaded AND the first result set has been
 * computed, which is a later commit — so for one paint the static index was
 * already hidden and the island had not arrived. The archive collapsed to a
 * heading, the footer flew up into view, and everything moved back down. At
 * 1,300 records that measured 0.0950 for the collapse and 0.0603 for the
 * recovery, against a budget of 0.05.
 *
 * The fix is a slot that holds the island's height for exactly as long as the
 * island is missing. That only works while the reserved number tracks the real
 * one, and the real one lives in TypeScript while the reservation lives in CSS
 * — two files that have no reason to be edited together. A comment saying "if
 * the 0.7 changes, change it here too" is a hope. This is the check.
 *
 * It reads both shipped sources rather than restating either.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CSS } from "./colour.js";

const ISLAND = readFileSync(
  join(process.cwd(), "apps", "web", "components", "catalog-island.tsx"),
  "utf8",
);

/** `Math.max(320, Math.round(window.innerHeight * 0.7))` -> { floor, fraction }. */
function islandGeometry(): { floor: number; fraction: number } {
  const body = /function viewportHeight\(\): number \{([\s\S]*?)\n\}/.exec(ISLAND)?.[1];
  expect(body, "viewportHeight() is gone from catalog-island.tsx").toBeDefined();

  const floor = /Math\.max\(\s*(\d+)\s*,/.exec(body!)?.[1];
  const fraction = /innerHeight\s*\*\s*([\d.]+)/.exec(body!)?.[1];
  expect(floor, "no floor found in viewportHeight()").toBeDefined();
  expect(fraction, "no viewport fraction found in viewportHeight()").toBeDefined();

  return { floor: Number(floor), fraction: Number(fraction) };
}

/** The reservation's `min-height: calc(max(320px, 70vh) + 200px);`. */
function reservation(): { rule: string; floorPx: number; vh: number; chromePx: number } {
  const rule = /\[data-catalog-active\] \.catalog-slot([^{]*)\{([^}]*)\}/.exec(CSS);
  expect(rule, "no .catalog-slot reservation in globals.css").not.toBeNull();

  const declaration = rule![2]!;
  const calc =
    /min-height:\s*calc\(\s*max\(\s*(\d+)px\s*,\s*([\d.]+)vh\s*\)\s*\+\s*(\d+)px\s*\)/.exec(
      declaration,
    );
  expect(calc, `min-height is not the expected calc(): ${declaration.trim()}`).not.toBeNull();

  return {
    rule: rule![1]!,
    floorPx: Number(calc![1]),
    vh: Number(calc![2]),
    chromePx: Number(calc![3]),
  };
}

describe("the archive's height reservation", () => {
  it("reserves the same viewport fraction the island asks for", () => {
    const island = islandGeometry();
    const css = reservation();
    expect(
      css.vh / 100,
      `globals.css reserves ${css.vh}vh but viewportHeight() uses ${island.fraction}`,
    ).toBeCloseTo(island.fraction, 5);
  });

  it("reserves the same floor the island asks for", () => {
    const island = islandGeometry();
    const css = reservation();
    expect(
      css.floorPx,
      `globals.css floors at ${css.floorPx}px but viewportHeight() floors at ${island.floor}`,
    ).toBe(island.floor);
  });

  it("allows for the controls, the status line and the facets", () => {
    /**
     * The virtualized list is not the whole island. A reservation of exactly
     * the list height would be short by the chrome around it, and short is a
     * correction — which is the thing being removed. The measured figure was
     * ~204px at 1,300 records; anything in this range keeps the correction
     * smaller than the shift it replaces.
     */
    const css = reservation();
    expect(css.chromePx).toBeGreaterThanOrEqual(120);
    expect(css.chromePx).toBeLessThanOrEqual(320);
  });

  it("is dropped as soon as the island exists", () => {
    /**
     * Without this the reservation is permanent, and an empty result set —
     * which is a short island — would sit above most of a screen of
     * whitespace. Measured: the slot is 904px with results and 311px with
     * none, because the rule stops applying.
     */
    const css = reservation();
    expect(
      css.rule.replace(/\s+/g, ""),
      "the reservation is not gated on the island being absent",
    ).toContain(":not(:has(.catalog))");
  });

  it("never applies without JavaScript", () => {
    // `data-catalog-active` is set by the island and by nothing else, so a
    // visitor with scripting off reserves nothing and reads the static index,
    // which is the whole degraded state (PRD 9.7).
    expect(CSS).toContain("[data-catalog-active] .catalog-slot");
    expect(ISLAND).toContain('dataset["catalogActive"]');
  });
});
